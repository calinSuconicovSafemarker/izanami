import { describe, expect, it } from 'vitest';
import {
  allOrgs,
  getOrg,
  officialContext,
  relatedDomainGroups,
  searchOrgs,
  toOrgInput,
  type Org,
} from './index';

const BBC: Org = {
  slug: 'bbc',
  name: 'BBC',
  wikidataId: 'Q9531',
  country: null,
  primaryDomain: 'bbc.co.uk',
  officialDomains: ['bbc.co.uk'],
  relatedDomains: [],
  brandTlds: [],
  wikidataDomain: 'bbc.co.uk',
  trancoRank: 100,
  confirmedAt: '2026-11-17',
};

describe('org accessor', () => {
  it('lists the bundled organisations', () => {
    expect(allOrgs.length).toBeGreaterThan(400);
  });

  it('finds an organisation by slug', () => {
    expect(getOrg('tu-delft')?.primaryDomain).toBe('tudelft.nl');
    expect(getOrg('no-such-org')).toBeUndefined();
  });

  it('converts an organisation to rules-engine input with a derived brand label', () => {
    expect(toOrgInput(BBC)).toEqual({
      slug: 'bbc',
      name: 'BBC',
      country: '',
      primaryDomain: 'bbc.co.uk',
      officialDomains: ['bbc.co.uk'],
      relatedOwned: [],
      brandTlds: [],
      brandLabel: 'bbc',
    });
  });

  it('counts curated and published related domains as official, Wikidata-owned ones as listed only (R1)', () => {
    const input = toOrgInput({
      ...BBC,
      relatedDomains: [
        { domain: 'bbci.co.uk', source: 'curated', url: 'https://example.org' },
        { domain: 'bbc.net', source: 'published-list', via: 'BBC list' },
        { domain: 'bbc.com', source: 'wikidata-owned', via: 'BBC Online' },
      ],
    });
    expect(input.officialDomains).toEqual(['bbc.co.uk', 'bbci.co.uk', 'bbc.net']);
    expect(input.relatedOwned).toEqual([{ domain: 'bbc.com', via: 'BBC Online' }]);
  });
});

describe('relatedDomainGroups', () => {
  it('groups related domains by source in a fixed order, skipping empty groups', () => {
    const groups = relatedDomainGroups({
      ...BBC,
      relatedDomains: [
        { domain: 'a.com', source: 'curated' },
        { domain: 'b.com', source: 'wikidata-owned', via: 'B' },
        { domain: 'c.com', source: 'curated' },
      ],
    });
    expect(groups.map((g) => [g.title, g.domains.map((d) => d.domain)])).toEqual([
      ['Official (curated, with source)', ['a.com', 'c.com']],
      ['Owned per Wikidata — verified at lookup', ['b.com']],
    ]);
  });
});

describe('bundled related domains', () => {
  const related = (slug: string) => getOrg(slug)?.relatedDomains ?? [];
  const sourceOf = (slug: string, domain: string) =>
    related(slug).find((r) => r.domain === domain)?.source;

  it("lists Google's products and short links, each with a source", () => {
    for (const d of ['youtube.com', 'gmail.com', 'g.co', 'android.com', 'youtu.be', 'abc.xyz'])
      expect(sourceOf('google', d), d).toBe('curated');
    expect(related('google').every((r) => r.url?.startsWith('https://'))).toBe(true);
  });

  it('never makes dead acquisitions or investments Official (R1)', () => {
    for (const d of ['jaiku.com', 'meebo.com', 'nothing.tech', 'chelseamarket.com'])
      expect(['wikidata-owned', undefined], d).toContain(sourceOf('google', d));
    expect(sourceOf('google', 'jaiku.com')).toBeUndefined();
    expect(sourceOf('google', 'nothing.tech')).toBeUndefined();
  });

  it('has no countries or states as organisations (R2)', () => {
    expect(allOrgs.find((o) => o.wikidataId === 'Q183')).toBeUndefined();
    expect(related('google').every((r) => r.url?.startsWith('https://'))).toBe(true);
  });

  it('never lists a domain under two organisations', () => {
    const officialOwner = new Map<string, string>();
    const relatedOwner = new Map<string, string>();
    for (const org of allOrgs) {
      for (const d of org.officialDomains) {
        expect(officialOwner.get(d), d).toBeUndefined();
        officialOwner.set(d, org.slug);
      }
      for (const r of org.relatedDomains) {
        expect(relatedOwner.get(r.domain), r.domain).toBeUndefined();
        expect(org.officialDomains).not.toContain(r.domain);
        relatedOwner.set(r.domain, org.slug);
      }
    }
    // The one allowed overlap: a related domain that is the official site of an org this one owns,
    // per Wikidata, a curated link or the company's own list (youtube.com under Google and as
    // YouTube's own entry; ADR-0002 Amendment 2).
    for (const org of allOrgs) {
      for (const r of org.relatedDomains) {
        if (officialOwner.has(r.domain)) {
          expect(r.via, r.domain).toBeTruthy();
        }
      }
    }
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

describe('officialContext (S2)', () => {
  it('normalises brand TLDs once and splits related domains by trust level', () => {
    const ctx = officialContext({
      ...BBC,
      brandTlds: ['.BBC', 'ГУГЛ'],
      relatedDomains: [
        { domain: 'bbci.co.uk', source: 'curated' },
        { domain: 'bbc.com', source: 'wikidata-owned', via: 'BBC Online' },
      ],
    });
    expect(ctx).toEqual({
      primary: 'bbc.co.uk',
      brandLabel: 'bbc',
      officialDomains: ['bbc.co.uk', 'bbci.co.uk'],
      relatedOwned: [{ domain: 'bbc.com', via: 'BBC Online' }],
      brandTlds: ['bbc', 'xn--c1aay4a'],
    });
  });
});
