import { describe, expect, it } from 'vitest';
import { curatedDomains, curatedOwnership, mergeExtras, parseExtras } from './extras';
import { majesticOnly, ranked } from '../lib/popularity-fixture';
import type { Org } from './select';

const NOW = '2026-11-17';

function org(partial: Partial<Org> & Pick<Org, 'wikidataId' | 'primaryDomain'>): Org {
  return {
    slug: partial.wikidataId.toLowerCase(),
    name: partial.wikidataId,
    country: null,
    officialDomains: [partial.primaryDomain],
    relatedDomains: [],
    brandTlds: [],
    wikidataDomain: partial.primaryDomain,
    popularity: majesticOnly(1),
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
  it('accepts a related-only entry that adds curated domains to a generated org', () => {
    const entry = {
      wikidataId: 'Q2283',
      name: 'Microsoft',
      relatedDomains: [{ domain: 'xbox.com', source: 'https://example.org/xbox' }],
    };
    expect(parseExtras([entry])).toEqual([entry]);
  });

  it('rejects a related domain that is not a registrable domain or lacks a source', () => {
    const entry = (domain: string, source: string) => ({
      wikidataId: 'Q2283',
      name: 'Microsoft',
      relatedDomains: [{ domain, source }],
    });
    expect(() => parseExtras([entry('www.xbox.com', 'https://example.org')])).toThrow(/domain/);
    expect(() => parseExtras([entry('xbox.com', 'not a url')])).toThrow(/source/);
  });

  it('rejects an entry with neither a primary domain nor related domains', () => {
    expect(() => parseExtras([{ wikidataId: 'Q2283', name: 'Microsoft' }])).toThrow(
      /source|primaryDomain/,
    );
  });
});

describe('curatedDomains', () => {
  it('lists the related domains of every extra with their source', () => {
    const extras = parseExtras([
      {
        ...TU_DELFT_EXTRA,
        relatedDomains: [{ domain: 'tudelft.com', source: 'https://example.org/a' }],
      },
      {
        wikidataId: 'Q2283',
        name: 'Microsoft',
        relatedDomains: [{ domain: 'xbox.com', source: 'https://example.org/b' }],
      },
    ]);
    expect(curatedDomains(extras)).toEqual([
      { wikidataId: 'Q752663', domain: 'tudelft.com', url: 'https://example.org/a' },
      { wikidataId: 'Q2283', domain: 'xbox.com', url: 'https://example.org/b' },
    ]);
  });

  it('ignores related-only entries when merging extras into the org list', () => {
    const orgs = mergeExtras(
      [org({ wikidataId: 'Q2283', primaryDomain: 'microsoft.com' })],
      parseExtras([
        {
          wikidataId: 'Q2283',
          name: 'Microsoft',
          relatedDomains: [{ domain: 'xbox.com', source: 'https://example.org/b' }],
        },
      ]),
      new Map(),
      NOW,
    );
    expect(orgs.map((o) => [o.wikidataId, o.name])).toEqual([['Q2283', 'Q2283']]);
  });
});

describe('curatedOwnership', () => {
  it('turns owns entries into ownership links with their source', () => {
    const extras = parseExtras([
      {
        wikidataId: 'Q2283',
        name: 'Microsoft',
        owns: [{ wikidataId: 'Q1406', name: 'Microsoft Windows', source: 'https://example.org/w' }],
      },
    ]);
    expect(curatedOwnership(extras)).toEqual([
      {
        parentId: 'Q2283',
        wikidataId: 'Q1406',
        name: 'Microsoft Windows',
        websites: [],
        source: 'https://example.org/w',
      },
    ]);
  });

  it('rejects an owns entry without a Q-id or source', () => {
    const entry = (owns: unknown) => ({ wikidataId: 'Q2283', name: 'Microsoft', owns: [owns] });
    expect(() =>
      parseExtras([entry({ wikidataId: 'x', name: 'W', source: 'https://e.org' })]),
    ).toThrow(/owns/);
    expect(() => parseExtras([entry({ wikidataId: 'Q1', name: 'W', source: '' })])).toThrow(/owns/);
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
      relatedDomains: [],
      brandTlds: [],
      wikidataDomain: null,
      popularity: null,
      confirmedAt: NOW,
    });
  });

  it('takes the popularity of the extra primary domain when it has one', () => {
    const [extra] = mergeExtras([], [TU_DELFT_EXTRA], ranked([['tudelft.nl', 25000]]), NOW);
    expect(extra?.popularity).toEqual(majesticOnly(25000));
  });

  it('overrides a generated entry for the same entity, keeping its other official domains', () => {
    const orgs = mergeExtras(
      [
        org({
          wikidataId: 'Q752663',
          slug: 'delft-university-of-technology',
          primaryDomain: 'tudelft.nl',
          officialDomains: ['tu-delft.com', 'tudelft.nl'],
          popularity: majesticOnly(300),
        }),
      ],
      [TU_DELFT_EXTRA],
      ranked([['tudelft.nl', 300]]),
      NOW,
    );
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({
      slug: 'tu-delft',
      officialDomains: ['tu-delft.com', 'tudelft.nl'],
      wikidataDomain: 'tudelft.nl',
      popularity: majesticOnly(300),
    });
  });
});
