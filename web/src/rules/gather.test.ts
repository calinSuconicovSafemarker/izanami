import { describe, expect, it } from 'vitest';
import { parseVariant } from '../domain';
import { FixtureLookupClient } from '../lookup/fixture-client';
import type { LookupClient } from '../lookup';
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
});
