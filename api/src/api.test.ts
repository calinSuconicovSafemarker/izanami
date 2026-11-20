import { describe, expect, it } from 'vitest';
import { startCheck } from '../../web/src/check';
import { toLookupExport, type LookupExport } from '../../web/src/export/lookup';
import { LiveLookupClient, type FetchLike, type LookupClient } from '../../web/src/lookup';
import { FixtureLookupClient } from '../../web/src/lookup/fixture-client';
import { allOrgs, getOrg, toOrgInput } from '../../web/src/orgs';
import { createApi, type ApiDeps, type ApiResponse } from './api';

const NOW = new Date('2026-11-19T12:00:00Z');

const orgWithWikidataDomain = () => allOrgs.find((o) => o.wikidataDomain !== null)!.slug;

/** Recorded responses only: no network. */
const fixtures: ApiDeps = { createClient: () => new FixtureLookupClient(), now: () => NOW };

const get = (path: string, query = '', deps: ApiDeps = fixtures) =>
  createApi(deps)({ method: 'GET', path, query });

const body = <T = Record<string, unknown>>(res: ApiResponse) => JSON.parse(res.body) as T;
const check = async (org: string, domain: string, deps?: ApiDeps) => {
  const res = await get('/api/check', new URLSearchParams({ org, domain }).toString(), deps);
  return { res, json: body<LookupExport>(res) };
};

describe('GET /api/check', () => {
  it('answers Official for a domain under a brand TLD, with no lookups', async () => {
    const { res, json } = await check('google', 'c.gle', {
      ...fixtures,
      createClient: () => {
        throw new Error('no lookups expected');
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject({
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    });
    expect(json).toMatchObject({
      schemaVersion: 1,
      kind: 'lookup',
      checkedAt: null,
      variant: { registrableDomain: 'c.gle' },
      verdict: { label: 'Official', score: 0 },
      tld: { tld: 'gle', category: 'official' },
      dataSources: { lookups: [] },
    });
  });

  it('scores a non-official domain with why, every rule, facts and analysis', async () => {
    // tudelft.nl checked against Google: both sides are in the recorded fixtures.
    const { res, json } = await check('google', 'tudelft.nl');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(json.verdict?.label).not.toBe('Official');
    expect(typeof json.verdict?.score).toBe('number');
    expect(json.rules).toHaveLength(15);
    for (const r of json.rules) {
      expect(r).toEqual({
        id: expect.any(String),
        status: expect.any(String),
        weight: expect.any(Number),
        summary: expect.any(String),
        explanation: expect.any(String),
      });
    }
    expect(json.why.length).toBeGreaterThan(0);
    expect(json).toMatchObject({
      checkedAt: NOW.toISOString(),
      existence: 'resolving',
      dns: { nameservers: expect.any(Array), spf: true },
      hosting: { asns: [1128] },
      official: { domain: 'google.com', asns: expect.arrayContaining([15169]) },
      analysis: { technique: expect.any(String), inPopularTop100k: true },
      tld: { tld: 'nl' },
      dataSources: { lookups: ['DNS', 'RDAP', 'ASN', 'Certificate Transparency (crt.sh)'] },
    });
  });

  it('scores a Wikidata-listed related domain (meebo.com) with listed-related, not Official', async () => {
    const { res, json } = await check('google', 'meebo.com');
    expect(res.status).toBe(200);
    expect(json.verdict?.label).not.toBe('Official');
    expect(json.rules.find((r) => r.id === 'listed-related')?.status).toBe('fired');
  });

  it('gives a not-registered variant no verdict', async () => {
    const { res, json } = await check('tu-delft', 'tudelft-lookalike-xq7z.nl');
    expect(res.status).toBe(200);
    expect(json.existence).toBe('not-registered');
    expect(json.verdict).toBeNull();
  });

  it("returns the website's Export JSON for the same lookup (one code path)", async () => {
    const org = getOrg('google')!;
    const client = new FixtureLookupClient();
    const started = startCheck('tudelft.nl', toOrgInput(org), client, { now: NOW });
    if (started.phase !== 'lookup') throw new Error('expected a lookup');
    const website = toLookupExport({
      org,
      variant: started.variant,
      facts: await started.facts,
      exportedAt: NOW,
    });
    const { json } = await check('google', 'tudelft.nl');
    expect(json).toEqual(JSON.parse(JSON.stringify(website)));
  });

  it('normalises an IDN to punycode through the shared parser', async () => {
    const { res, json } = await check('tu-delft', 'tudеlft-lookalike-xq7z.nl'); // Cyrillic е
    expect(res.status).toBe(200);
    expect(json.variant.punycode).toMatch(/^xn--/);
    expect(json.analysis.homoglyphs).toEqual([{ text: 'е', looksLike: 'e', codePoints: 'U+0435' }]);
  });

  describe('input validation', () => {
    it.each([
      ['missing org', 'domain=example.com', 'missing-parameter'],
      ['missing domain', 'org=google', 'missing-parameter'],
      ['empty domain', 'org=google&domain=', 'missing-parameter'],
      ['repeated domain', 'org=google&domain=a.com&domain=b.com', 'duplicate-parameter'],
      ['a URL with a path', 'org=google&domain=https%3A%2F%2Fevil.com%2Flogin', 'invalid-domain'],
      ['a path', 'org=google&domain=evil.com%2Flogin', 'invalid-domain'],
      ['a port', 'org=google&domain=evil.com%3A8080', 'invalid-domain'],
      ['userinfo', 'org=google&domain=google.com%40evil.com', 'invalid-domain'],
      ['an IPv4 address', 'org=google&domain=192.0.2.1', 'invalid-domain'],
      ['an IPv6 address', 'org=google&domain=%5B2001%3Adb8%3A%3A1%5D', 'invalid-domain'],
      ['spaces', 'org=google&domain=goo%20gle.com', 'invalid-domain'],
      ['a control character', 'org=google&domain=google.com%00', 'invalid-domain'],
      ['no public suffix', 'org=google&domain=localhost', 'invalid-domain'],
      ['bad characters', 'org=google&domain=goo_gle.com', 'invalid-domain'],
      ['over 253 characters', `org=google&domain=${'a.'.repeat(126)}com`, 'invalid-domain'],
    ])('rejects %s with 400 JSON', async (_name, query, code) => {
      const res = await get('/api/check', query, {
        ...fixtures,
        createClient: () => {
          throw new Error('no lookups for bad input');
        },
      });
      expect(res.status).toBe(400);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(body(res)).toEqual({ error: { code, message: expect.any(String) } });
    });

    it.each(['nope', 'Google', '../etc', 'a'.repeat(80)])(
      'answers 404 JSON for unknown org %s',
      async (org) => {
        const res = await get(
          '/api/check',
          new URLSearchParams({ org, domain: 'x.com' }).toString(),
        );
        expect(res.status).toBe(404);
        expect(body(res)).toMatchObject({ error: { code: 'unknown-org' } });
      },
    );
  });

  describe('caching (ticket 21)', () => {
    /** The recorded fixtures, with one kind of lookup failing transiently. */
    const failing = (method: 'certs' | 'rdap' | 'dns'): ApiDeps => ({
      ...fixtures,
      createClient: () => {
        const inner = new FixtureLookupClient();
        return {
          dns: (name, type) =>
            method === 'dns' && name === 'google.com'
              ? Promise.resolve({ status: 'unavailable', name, type, records: [] })
              : inner.dns(name, type),
          rdap: (domain) =>
            method === 'rdap'
              ? Promise.resolve({ status: 'unavailable', domain, nameservers: [] })
              : inner.rdap(domain),
          asn: (ip) => inner.asn(ip),
          certs: (domain) =>
            method === 'certs'
              ? Promise.resolve({ status: 'unavailable', domain, certs: [] })
              : inner.certs(domain),
        };
      },
    });

    it('lets CloudFront cache a clean lookup for an hour', async () => {
      const { res } = await check('google', 'tudelft.nl');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
    });

    it.each([
      ['crt.sh on the variant', 'certs'],
      ['RDAP', 'rdap'],
      ['DNS on the official domain', 'dns'],
    ] as const)('sends no-store when %s failed transiently', async (_name, method) => {
      const { res, json } = await check('google', 'tudelft.nl', failing(method));
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(json.schemaVersion).toBe(1);
    });

    it('sends no-store when every upstream answer is oversized', async () => {
      const huge: FetchLike = () =>
        Promise.resolve(new Response(`"${' '.repeat(6 * 1024 * 1024)}"`));
      const { res, json } = await check('google', 'tudelft.nl', {
        ...fixtures,
        createClient: (signal) => new LiveLookupClient({ fetch: huge, signal }),
      });
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(json.verdict?.label).toBe('Insufficient data');
    });

    it('answers 200 (not 500) when resolvers return malformed DoH JSON', async () => {
      const malformed: FetchLike = () => Promise.resolve(new Response('{"Status":"bad"'));
      const { res } = await check('google', 'tudelft.nl', {
        ...fixtures,
        createClient: (signal) => new LiveLookupClient({ fetch: malformed, signal }),
      });
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('time budget', () => {
    const hang: FetchLike = () => new Promise(() => {});

    it('cuts off slow lookups at the budget: unknown facts, still a verdict, not cached', async () => {
      const { res, json } = await check('google', 'tudelft.nl', {
        ...fixtures,
        createClient: (signal) => new LiveLookupClient({ fetch: hang, signal }),
        lookupBudgetMs: 30,
      });
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(json.existence).toBeNull();
      expect(json.verdict?.label).toBe('Insufficient data');
      expect(json.dataSources.unknown).toEqual(
        expect.arrayContaining(['DNS', 'RDAP', 'Certificate Transparency (crt.sh)']),
      );
    });

    it('answers 504 JSON when the check has not settled by the hard limit', async () => {
      const stuck: LookupClient = {
        dns: () => new Promise(() => {}),
        rdap: () => new Promise(() => {}),
        asn: () => new Promise(() => {}),
        certs: () => new Promise(() => {}),
      };
      const logged: unknown[] = [];
      const res = await get('/api/check', 'org=google&domain=gooogle.com', {
        ...fixtures,
        createClient: () => stuck,
        lookupBudgetMs: 10,
        hardTimeoutMs: 30,
        logError: (e) => logged.push(e),
      });
      expect(res.status).toBe(504);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(body(res)).toEqual({
        error: { code: 'upstream-timeout', message: expect.any(String) },
      });
      expect(logged).toEqual([{ status: 504, code: 'upstream-timeout' }]);
    });
  });

  it('answers 500 JSON without a stack trace, and logs no query', async () => {
    const logged: unknown[] = [];
    const res = await get('/api/check', 'org=google&domain=gooogle.com', {
      ...fixtures,
      now: () => {
        throw new Error('boom at secret/path.ts:12');
      },
      logError: (e) => logged.push(e),
    });
    expect(res.status).toBe(500);
    expect(body(res)).toEqual({
      error: { code: 'internal-error', message: 'Something went wrong.' },
    });
    expect(res.body).not.toMatch(/boom|\.ts|at /);
    expect(JSON.stringify(logged)).not.toContain('gooogle');
    expect(logged).toEqual([{ status: 500, code: 'internal-error' }]);
  });
});

describe('GET /api/orgs', () => {
  it('lists every organisation as {id, name, primaryDomain}', async () => {
    const res = await get('/api/orgs');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    const orgs = body<{ id: string; name: string; primaryDomain: string }[]>(res);
    expect(orgs.length).toBeGreaterThan(400);
    expect(orgs).toContainEqual({ id: 'google', name: 'Google', primaryDomain: 'google.com' });
    expect(Object.keys(orgs[0]!)).toEqual(['id', 'name', 'primaryDomain']);
  });
});

describe('GET /api/orgs/<id>', () => {
  it("returns the official context with each domain's trust level", async () => {
    const res = await get('/api/orgs/google');
    expect(res.status).toBe(200);
    const org = body(res);
    expect(org).toMatchObject({ id: 'google', name: 'Google', primary: 'google.com' });
    // Google is a curated extra (no Wikidata P856 domain match), so its own sites say so.
    expect(org.officialDomains).toContainEqual({
      domain: 'google.com',
      source: 'curated-extra',
      trust: 'official',
    });
    const tudelftLike = body(await get(`/api/orgs/${orgWithWikidataDomain()}`));
    expect(tudelftLike.officialDomains).toContainEqual(
      expect.objectContaining({ source: 'wikidata-official-website', trust: 'official' }),
    );
    expect(org.officialDomains).toContainEqual(
      expect.objectContaining({ domain: 'android.com', source: 'curated', trust: 'official' }),
    );
    expect(org.relatedOwned).toContainEqual(
      expect.objectContaining({
        domain: 'meebo.com',
        source: 'wikidata-owned',
        via: 'meebo',
        trust: 'verify',
      }),
    );
    expect(org.brandTlds).toEqual(expect.arrayContaining(['gle', 'google']));
  });

  it('answers 404 JSON for an unknown org', async () => {
    const res = await get('/api/orgs/no-such-org');
    expect(res.status).toBe(404);
    expect(body(res)).toMatchObject({ error: { code: 'unknown-org' } });
  });
});

describe('GET /api/health', () => {
  it('reports ok and the data version, uncached', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(body(res)).toEqual({
      ok: true,
      dataVersion: expect.stringMatching(/^\d{4}-\d\d-\d\d$/),
    });
  });
});

describe('routing and methods', () => {
  it.each(['/', '/api', '/api/', '/api/checks', '/api/orgs/google/x', '/api/health/'])(
    'answers 404 JSON for %s',
    async (path) => {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(body(res)).toMatchObject({ error: { code: 'not-found' } });
    },
  );

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'])(
    'answers 405 JSON with Allow for %s',
    async (method) => {
      const res = await createApi(fixtures)({ method, path: '/api/health', query: '' });
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('GET, HEAD');
      expect(body(res)).toMatchObject({ error: { code: 'method-not-allowed' } });
    },
  );

  it('answers HEAD with the GET headers and an empty body', async () => {
    const res = await createApi(fixtures)({ method: 'HEAD', path: '/api/orgs', query: '' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toBe('');
  });
});
