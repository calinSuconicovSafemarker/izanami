import { describe, expect, it } from 'vitest';
import { allOrgs, getOrg, searchOrgs, toOrgInput } from './index';

describe('org accessor', () => {
  it('lists the bundled organisations', () => {
    expect(allOrgs.length).toBeGreaterThan(400);
  });

  it('finds an organisation by slug', () => {
    expect(getOrg('tu-delft')?.primaryDomain).toBe('tudelft.nl');
    expect(getOrg('no-such-org')).toBeUndefined();
  });

  it('converts an organisation to rules-engine input with a derived brand label', () => {
    const org = getOrg('tu-delft');
    if (!org) throw new Error('tu-delft missing');
    expect(toOrgInput(org)).toEqual({
      slug: 'tu-delft',
      name: 'Delft University of Technology',
      country: 'NL',
      primaryDomain: 'tudelft.nl',
      officialDomains: ['tudelft.nl'],
      brandLabel: 'tudelft',
    });
  });

  it('derives the brand label from the registrable label of multi-part suffixes', () => {
    const input = toOrgInput({
      slug: 'bbc',
      name: 'BBC',
      wikidataId: 'Q9531',
      country: null,
      primaryDomain: 'bbc.co.uk',
      officialDomains: ['bbc.co.uk'],
      wikidataDomain: 'bbc.co.uk',
      trancoRank: 100,
      confirmedAt: '2026-11-17',
    });
    expect(input.brandLabel).toBe('bbc');
    expect(input.country).toBe('');
  });
});

describe('searchOrgs', () => {
  it('matches by name, case-insensitively', () => {
    expect(searchOrgs('delft').map((o) => o.slug)).toContain('tu-delft');
  });

  it('matches by official domain', () => {
    expect(searchOrgs('tudelft.nl').map((o) => o.slug)).toEqual(['tu-delft']);
  });

  it('returns every organisation for an empty query', () => {
    expect(searchOrgs('  ')).toHaveLength(allOrgs.length);
  });
});
