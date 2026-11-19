import { describe, expect, it } from 'vitest';
import { parseVariant } from '../domain';
import { FixtureLookupClient } from '../lookup/fixture-client';
import type { DnsType, LookupClient, RdapResult } from '../lookup';
import { evaluate } from './evaluate';
import { gatherFacts } from './gather';
import type { Facts, OrgInput } from './types';
import { known, UNKNOWN } from './types';
import { verdict } from './verdict';

const TU_DELFT: OrgInput = {
  slug: 'tu-delft',
  name: 'Delft University of Technology',
  country: 'NL',
  primaryDomain: 'tudelft.nl',
  officialDomains: ['tudelft.nl'],
  brandLabel: 'tudelft',
};

const now = new Date('2026-11-17T12:00:00Z');

/** Counts calls per method; wraps a fresh client so the official-facts cache starts empty. */
function counting(inner: LookupClient) {
  const calls: string[] = [];
  const client: LookupClient = {
    dns: (n, t) => (calls.push(`dns ${n} ${t}`), inner.dns(n, t)),
    rdap: (d) => (calls.push(`rdap ${d}`), inner.rdap(d)),
    asn: (ip) => (calls.push(`asn ${ip}`), inner.asn(ip)),
    certs: (d) => (calls.push(`certs ${d}`), inner.certs(d)),
  };
  return { client, calls };
}

/** A client answering every lookup from in-memory records (`unavailable` for unlisted domains). */
function stub(
  domains: Record<string, { dns?: Partial<Record<DnsType, string[]>>; rdap?: Partial<RdapResult> }>,
): LookupClient {
  return {
    dns: async (name, type) => {
      const d = domains[name];
      if (!d) return { status: 'unavailable', name, type, records: [] };
      return { status: 'ok', name, type, records: d.dns?.[type] ?? [] };
    },
    rdap: async (domain) => {
      const d = domains[domain];
      if (!d) return { status: 'unavailable', domain, nameservers: [] };
      return { status: 'ok', domain, registered: true, nameservers: [], ...d.rdap };
    },
    asn: async (ip) => ({ status: 'ok', ip, asn: 1128 }),
    certs: async (domain) => ({ status: 'ok', domain, certs: [] }),
  };
}

describe('gatherFacts', () => {
  it('collects the official domain itself (recorded tudelft.nl) and scores it Official', async () => {
    const facts = await gatherFacts(
      parseVariant('tudelft.nl'),
      TU_DELFT,
      new FixtureLookupClient(),
      { now },
    );
    const v = facts.variantFacts;
    expect(v.existence).toEqual(known('resolving'));
    expect(v.registrationDate).toEqual(known('1987-07-23T00:00:00Z'));
    expect(v.registrar).toEqual(known('Technische Universiteit Delft'));
    expect(v.nameservers).toEqual(
      known(expect.arrayContaining(['ns1.surfnet.nl', 'ns1.zurich.surf.net'])),
    );
    expect(v.mx).toEqual(known(['tudelft-nl.mail.protection.outlook.com']));
    expect(v.asns).toEqual(known([1128]));
    expect(v.firstCertDate).toEqual(known('2006-07-17T14:53:54Z'));
    expect(v.inTranco).toBe(true);
    expect(v.checkedAt).toBe('2026-11-17T12:00:00.000Z');
    expect(facts.officialFacts.domain).toBe('tudelft.nl');
    expect(facts.officialFacts.asns).toEqual(known([1128]));
    expect(verdict(evaluate(facts)).verdict).toBe('Official');
  });

  it('recognises a variant that is not registered (NXDOMAIN + RDAP 404)', async () => {
    const facts = await gatherFacts(
      parseVariant('tudelft-lookalike-xq7z.nl'),
      TU_DELFT,
      new FixtureLookupClient(),
      { now },
    );
    const v = facts.variantFacts;
    expect(v.existence).toEqual(known('not-registered'));
    expect(v.nameservers).toEqual(known([]));
    expect(v.mx).toEqual(known([]));
    expect(v.spf).toEqual(known(false));
    expect(v.asns).toEqual(known([]));
    expect(v.similarity.kind).toBe('combo');
  });

  it('turns failed lookups into unknown facts and Insufficient data', async () => {
    // No recordings for tudelft.xyz: every request fails like a network error.
    const facts = await gatherFacts(
      parseVariant('tudelft.xyz'),
      TU_DELFT,
      new FixtureLookupClient(),
      { now },
    );
    const v = facts.variantFacts;
    expect(v.existence).toEqual(UNKNOWN);
    expect(v.registrationDate).toEqual(UNKNOWN);
    expect(v.mx).toEqual(UNKNOWN);
    expect(v.asns).toEqual(UNKNOWN);
    expect(verdict(evaluate(facts)).verdict).toBe('Insufficient data');
  });

  it("fetches the official domain's facts once per client", async () => {
    const { client, calls } = counting(new FixtureLookupClient());
    await gatherFacts(parseVariant('tudelft-lookalike-xq7z.nl'), TU_DELFT, client, { now });
    await gatherFacts(parseVariant('tudelft-lookalike-xq7z.guide'), TU_DELFT, client, { now });
    expect(calls.filter((c) => c === 'rdap tudelft.nl')).toHaveLength(1);
    expect(calls.filter((c) => c === 'dns tudelft.nl NS')).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('certs tudelft.nl'))).toHaveLength(0);
  });

  it('reports progress: pending facts first, then the final facts', async () => {
    const snapshots: Facts[] = [];
    const final = await gatherFacts(
      parseVariant('tudelft-lookalike-xq7z.nl'),
      TU_DELFT,
      new FixtureLookupClient(),
      { now, onProgress: (f) => snapshots.push(f) },
    );
    expect(snapshots.length).toBeGreaterThan(2);
    expect(snapshots[0]!.variantFacts.existence).toEqual({ state: 'pending' });
    expect(snapshots[0]!.officialFacts.registrar).toEqual({ state: 'pending' });
    expect(snapshots.at(-1)).toEqual(final);
    // Partial facts are safe to evaluate: pending facts read as unknown.
    expect(evaluate(snapshots[0]!).find((r) => r.id === 'young-domain')?.status).toBe('unknown');
  });

  it('treats a delegated domain with only NS records as registered, not resolving', async () => {
    const client = stub({
      'tudelft.com': { dns: { NS: ['ns1.tudelft.nl'] }, rdap: { nameservers: ['ns1.tudelft.nl'] } },
      'tudelft.nl': { dns: { NS: ['ns1.tudelft.nl'], A: ['130.161.128.82'] } },
    });
    const facts = await gatherFacts(parseVariant('tudelft.com'), TU_DELFT, client, { now });
    expect(facts.variantFacts.existence).toEqual(known('registered-not-resolving'));
  });

  it('collects the A and AAAA addresses of both domains', async () => {
    const client = stub({
      'tudelft.com': { dns: { A: ['192.0.2.1', '192.0.2.2'], AAAA: ['2001:db8::1'] } },
      'tudelft.nl': { dns: { A: ['130.161.128.82'] } },
    });
    const facts = await gatherFacts(parseVariant('tudelft.com'), TU_DELFT, client, { now });
    expect(facts.variantFacts.addresses).toEqual(known(['192.0.2.1', '192.0.2.2', '2001:db8::1']));
    expect(facts.officialFacts.addresses).toEqual(known(['130.161.128.82']));
  });

  it('counts an MX-only domain as resolving', async () => {
    const client = stub({
      'tudelft.com': { dns: { MX: ['10 mx.example.net'] } },
      'tudelft.nl': { dns: { A: ['130.161.128.82'] } },
    });
    const facts = await gatherFacts(parseVariant('tudelft.com'), TU_DELFT, client, { now });
    expect(facts.variantFacts.existence).toEqual(known('resolving'));
  });

  it('caches official facts the registry does not publish (no registration date)', async () => {
    const { client, calls } = counting(
      stub({
        'tudelft.de': {},
        'example.de': {
          dns: { NS: ['ns1.example.de'], A: ['192.0.2.1'], MX: ['10 mx.example.de'] },
          rdap: { registrar: 'DENIC member' },
        },
      }),
    );
    const org = { ...TU_DELFT, slug: 'example', primaryDomain: 'example.de' };
    const first = await gatherFacts(parseVariant('tudelft.de'), org, client, { now });
    expect(first.officialFacts.registrationDate).toEqual(UNKNOWN);
    await gatherFacts(parseVariant('tudelft.de'), org, client, { now });
    expect(calls.filter((c) => c === 'rdap example.de')).toHaveLength(1);
  });

  it('retries official facts after a transient lookup failure', async () => {
    const { client, calls } = counting(stub({ 'tudelft.de': {} }));
    const org = { ...TU_DELFT, slug: 'example', primaryDomain: 'example.de' };
    await gatherFacts(parseVariant('tudelft.de'), org, client, { now });
    await gatherFacts(parseVariant('tudelft.de'), org, client, { now });
    expect(calls.filter((c) => c === 'rdap example.de')).toHaveLength(2);
  });

  it('records whether RDAP answered, so "not published" is told apart from a failed lookup (R6)', async () => {
    const org = { ...TU_DELFT, slug: 'example', primaryDomain: 'example.de' };
    const facts = await gatherFacts(
      parseVariant('tudelft.de'),
      org,
      stub({ 'example.de': { rdap: { registrar: 'DENIC member' } } }),
      { now },
    );
    expect(facts.variantFacts.rdap).toEqual(UNKNOWN);
    expect(facts.officialFacts.rdap).toEqual(known('ok'));
  });

  it('marks a variant listed by Wikidata as owned (R1)', async () => {
    const org = { ...TU_DELFT, relatedOwned: [{ domain: 'tudelft.de', via: 'TU Delft Germany' }] };
    const facts = await gatherFacts(parseVariant('www.tudelft.de'), org, stub({}), { now });
    expect(facts.variantFacts.listedRelated).toEqual({ via: 'TU Delft Germany' });
    expect(facts.variantFacts.similarity.isOfficial).toBe(false);
  });
});
