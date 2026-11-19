import { FIXTURES, fixtureFetch } from './fixture-client';
import { LiveLookupClient } from './live-client';
import type { FetchLike } from './types';

const tudelft = fixtureFetch([FIXTURES['tudelft.nl']!]);

const failing =
  (pattern: RegExp, inner: FetchLike): FetchLike =>
  (input, init) =>
    pattern.test(input) ? Promise.reject(new TypeError('Failed to fetch')) : inner(input, init);

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('DoH fallback', () => {
  it('falls back to Google when Cloudflare fails', async () => {
    const client = new LiveLookupClient({ fetch: failing(/cloudflare-dns/, tudelft) });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({
      status: 'ok',
      records: ['130.161.128.82'],
    });
  });

  it('falls back to Google when Cloudflare answers SERVFAIL', async () => {
    const fetch: FetchLike = (input, init) =>
      /cloudflare-dns/.test(input) ? json({ Status: 2 }) : tudelft(input, init);
    const client = new LiveLookupClient({ fetch });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({
      status: 'ok',
      records: ['130.161.128.82'],
    });
  });

  it('is unavailable when both resolvers fail', async () => {
    const client = new LiveLookupClient({ fetch: () => json({ error: 'nope' }, 500) });
    expect(await client.dns('tudelft.nl', 'A')).toEqual({
      status: 'unavailable',
      name: 'tudelft.nl',
      type: 'A',
      records: [],
    });
  });
});

describe('rdap', () => {
  const vcard = (fn: string) => [
    'vcard',
    [
      ['version', {}, 'text', '4.0'],
      ['fn', {}, 'text', fn],
    ],
  ];
  const rdapBody = (registrantFn: string, redacted: unknown[] = []) => ({
    entities: [{ roles: ['registrant'], vcardArray: vcard(registrantFn) }],
    redacted,
  });
  const clientServing = (body: unknown, status = 200) =>
    new LiveLookupClient({
      fetch: () => json(body, status),
      rdapBaseUrls: { example: 'https://rdap.example' },
    });

  it('returns the registrant when the registry publishes it', async () => {
    const result = await clientServing(rdapBody('Acme B.V.')).rdap('acme.example');
    expect(result.registrant).toBe('Acme B.V.');
  });

  it('hides a registrant name flagged by an RFC 9537 redaction marker', async () => {
    const body = rdapBody('Jane Doe', [{ name: { description: 'Registrant Name' } }]);
    const result = await clientServing(body).rdap('acme.example');
    expect(result.registrant).toBeUndefined();
  });

  it('builds the request URL from the injected base-URL map', async () => {
    const seen: string[] = [];
    const client = new LiveLookupClient({
      fetch: (input) => (seen.push(input), json({})),
      rdapBaseUrls: { example: 'https://rdap.example' },
    });
    await client.rdap('acme.example');
    expect(seen).toEqual(['https://rdap.example/domain/acme.example']);
  });

  it('is unavailable on a server error', async () => {
    expect(await clientServing({}, 503).rdap('acme.example')).toEqual({
      status: 'unavailable',
      domain: 'acme.example',
      nameservers: [],
    });
  });

  it('is unavailable on a network error', async () => {
    const client = new LiveLookupClient({ fetch: () => Promise.reject(new TypeError('CORS')) });
    expect(await client.rdap('acme.example')).toMatchObject({ status: 'unavailable' });
  });
});

describe('certs timeout', () => {
  it('gives up on a slow crt.sh after the configured timeout', async () => {
    const hang: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    const client = new LiveLookupClient({ fetch: hang, certsTimeoutMs: 20 });
    expect(await client.certs('tudelft.nl')).toEqual({
      status: 'unavailable',
      domain: 'tudelft.nl',
      certs: [],
    });
  });
});

describe('request timeout and overall deadline (API)', () => {
  const hang: FetchLike = () => new Promise(() => {});

  it('fails a slow DoH or RDAP request after requestTimeoutMs, trying the next resolver', async () => {
    const fetch: FetchLike = (input, init) =>
      /cloudflare-dns/.test(input) ? hang(input, init) : tudelft(input, init);
    const client = new LiveLookupClient({ fetch, requestTimeoutMs: 20 });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({
      status: 'ok',
      records: ['130.161.128.82'],
    });
    expect(await client.rdap('tudelft.nl')).toMatchObject({ status: 'unavailable' });
  });

  it('fails every lookup once the client signal aborts, even a fetch that ignores it', async () => {
    const deadline = new AbortController();
    const client = new LiveLookupClient({ fetch: hang, signal: deadline.signal });
    const pending = Promise.all([
      client.dns('tudelft.nl', 'A'),
      client.rdap('tudelft.nl'),
      client.certs('tudelft.nl'),
    ]);
    deadline.abort();
    const [dns, rdap, certs] = await pending;
    expect([dns.status, rdap.status, certs.status]).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
    // Lookups started after the deadline fail at once.
    expect((await client.asn('130.161.128.82')).status).toBe('unavailable');
  });
});

describe('request hygiene (CORS-simple requests)', () => {
  it('sends no credentials and no headers other than accept', async () => {
    const inits: (RequestInit | undefined)[] = [];
    const spy: FetchLike = (input, init) => (inits.push(init), tudelft(input, init));
    const client = new LiveLookupClient({
      fetch: spy,
      rdapBaseUrls: { nl: 'https://rdap.sidn.nl/' },
    });

    await client.dns('tudelft.nl', 'A');
    await client.rdap('tudelft.nl');
    await client.asn('130.161.128.82');
    await client.certs('tudelft.nl');

    expect(inits).toHaveLength(4);
    for (const init of inits) {
      expect(init?.credentials).toBe('omit');
      const names = [...new Headers(init?.headers).keys()];
      expect(names.every((n) => n === 'accept')).toBe(true);
    }
  });
});
