import { describe, expect, it } from 'vitest';
import { FixtureLookupClient } from '../lookup/fixture-client';
import type { LookupClient } from '../lookup';
import { getOrg, toOrgInput } from '../orgs';
import { startCheck } from './check';

const tudelft = toOrgInput(getOrg('tu-delft')!);
const google = toOrgInput(getOrg('google')!);

describe('startCheck', () => {
  it('reports invalid input synchronously, without lookups', () => {
    const check = startCheck('not a domain', tudelft, new FixtureLookupClient());
    expect(check).toMatchObject({ phase: 'invalid', input: 'not a domain' });
  });

  it('short-circuits an official domain and a brand TLD to official, without lookups', () => {
    const noLookups = new Proxy({} as LookupClient, {
      get: () => () => Promise.reject(new Error('no lookups expected')),
    });
    expect(startCheck('www.tudelft.nl', tudelft, noLookups)).toMatchObject({ phase: 'official' });
    expect(startCheck('c.gle', google, noLookups)).toMatchObject({
      phase: 'official',
      brandTld: 'gle',
    });
  });

  it('gathers facts through the wrapped client for any other variant', async () => {
    const seen: string[] = [];
    const check = startCheck('tudelft-lookalike-xq7z.nl', tudelft, new FixtureLookupClient(), {
      now: new Date('2026-11-19T00:00:00Z'),
      clientFor: (variant, client) => {
        seen.push(variant.registrableDomain);
        return client;
      },
    });
    expect(check.phase).toBe('lookup');
    if (check.phase !== 'lookup') return;
    const facts = await check.facts;
    expect(seen).toEqual(['tudelft-lookalike-xq7z.nl']);
    expect(facts.variantFacts.existence).toEqual({ state: 'known', value: 'not-registered' });
    expect(facts.variantFacts.checkedAt).toBe('2026-11-19T00:00:00.000Z');
  });
});
