import { describe, expect, it } from 'vitest';
import { mergeExtras, parseExtras } from './extras';
import type { Org } from './select';

const NOW = '2026-11-17';

function org(partial: Partial<Org> & Pick<Org, 'wikidataId' | 'primaryDomain'>): Org {
  return {
    slug: partial.wikidataId.toLowerCase(),
    name: partial.wikidataId,
    country: null,
    officialDomains: [partial.primaryDomain],
    wikidataDomain: partial.primaryDomain,
    trancoRank: 1,
    confirmedAt: NOW,
    ...partial,
  };
}

const TU_DELFT_EXTRA = {
  wikidataId: 'Q752663',
  slug: 'tu-delft',
  name: 'Delft University of Technology',
  country: 'NL',
  primaryDomain: 'tudelft.nl',
  officialDomains: ['tudelft.nl'],
  source: 'https://www.wikidata.org/wiki/Q752663#P856',
};

describe('parseExtras', () => {
  it('accepts curated entries that cite a source', () => {
    expect(parseExtras([TU_DELFT_EXTRA])).toEqual([TU_DELFT_EXTRA]);
  });

  it('rejects an entry without a source URL', () => {
    expect(() => parseExtras([{ ...TU_DELFT_EXTRA, source: '' }])).toThrow(/source/);
  });

  it('rejects an entry whose primary domain is not among its official domains', () => {
    expect(() => parseExtras([{ ...TU_DELFT_EXTRA, officialDomains: ['tu.nl'] }])).toThrow(
      /primaryDomain/,
    );
  });
});

describe('mergeExtras', () => {
  it('adds an unranked extra after the ranked organisations', () => {
    const orgs = mergeExtras(
      [org({ wikidataId: 'Q95', primaryDomain: 'google.com' })],
      [TU_DELFT_EXTRA],
      new Map(),
      NOW,
    );
    expect(orgs.map((o) => o.slug)).toEqual(['q95', 'tu-delft']);
    expect(orgs[1]).toEqual({
      slug: 'tu-delft',
      name: 'Delft University of Technology',
      wikidataId: 'Q752663',
      country: 'NL',
      primaryDomain: 'tudelft.nl',
      officialDomains: ['tudelft.nl'],
      wikidataDomain: null,
      trancoRank: null,
      confirmedAt: NOW,
    });
  });

  it('takes the Tranco rank of the extra primary domain when it has one', () => {
    const [extra] = mergeExtras([], [TU_DELFT_EXTRA], new Map([['tudelft.nl', 25000]]), NOW);
    expect(extra?.trancoRank).toBe(25000);
  });

  it('overrides a generated entry for the same entity, keeping its other official domains', () => {
    const orgs = mergeExtras(
      [
        org({
          wikidataId: 'Q752663',
          slug: 'delft-university-of-technology',
          primaryDomain: 'tudelft.nl',
          officialDomains: ['tu-delft.com', 'tudelft.nl'],
          trancoRank: 300,
        }),
      ],
      [TU_DELFT_EXTRA],
      new Map([['tudelft.nl', 300]]),
      NOW,
    );
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({
      slug: 'tu-delft',
      officialDomains: ['tu-delft.com', 'tudelft.nl'],
      wikidataDomain: 'tudelft.nl',
      trancoRank: 300,
    });
  });
});
