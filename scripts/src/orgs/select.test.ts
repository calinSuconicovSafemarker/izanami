import { describe, expect, it } from 'vitest';
import { majesticOnly, ranked } from '../lib/popularity-fixture';
import { selectOrgs } from './select';
import type { WikidataEntity } from './wikidata';

const NOW = '2026-11-17';

function entity(id: string, name: string, websites: string[], extra: Partial<WikidataEntity> = {}) {
  return {
    wikidataId: id,
    name,
    sitelinks: 10,
    isOrganisation: true,
    isProduct: false,
    classes: [],
    countries: [],
    websites,
    ...extra,
  };
}

function entities(...list: WikidataEntity[]): Map<string, WikidataEntity> {
  return new Map(list.map((e) => [e.wikidataId, e]));
}

describe('selectOrgs', () => {
  it('excludes an entity whose official domain is not in the popularity data', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q1', 'Ranked Corp', ['https://ranked.com/']),
        entity('Q2', 'Obscure Society', ['https://obscure-society.org/']),
      ),
      popularity: ranked([['ranked.com', 42]]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.wikidataId)).toEqual(['Q1']);
  });

  it('uses the best-ranked domain as primary and keeps every root-level P856 domain', () => {
    const [org] = selectOrgs({
      entities: entities(
        entity(
          'Q752663',
          'Delft University of Technology',
          [
            'http://www.tudelft.nl',
            'https://www.tu-delft.com/',
            'https://www.tudelft.nl/',
            'https://www.tudelft.nl/en/',
            'https://github.com/tudelft',
          ],
          { countries: ['NL'] },
        ),
      ),
      popularity: ranked([
        ['github.com', 1],
        ['tu-delft.com', 900],
        ['tudelft.nl', 300],
      ]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(org).toEqual({
      slug: 'delft-university-of-technology',
      name: 'Delft University of Technology',
      wikidataId: 'Q752663',
      country: 'NL',
      primaryDomain: 'tudelft.nl',
      officialDomains: ['tu-delft.com', 'tudelft.nl'],
      relatedDomains: [],
      brandTlds: [],
      wikidataDomain: 'tudelft.nl',
      popularity: majesticOnly(300),
      confirmedAt: NOW,
    });
  });

  it('keeps the top N by popularity, best first', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q1', 'C', ['https://c.com/']),
        entity('Q2', 'A', ['https://a.com/']),
        entity('Q3', 'B', ['https://b.com/']),
      ),
      popularity: ranked([
        ['a.com', 1],
        ['b.com', 2],
        ['c.com', 3],
      ]),
      limit: 2,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.name)).toEqual(['A', 'B']);
  });

  it('keeps pinned organisations beyond the limit, in popularity order', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q1', 'C', ['https://c.com/']),
        entity('Q2', 'A', ['https://a.com/']),
        entity('Q3', 'B', ['https://b.com/']),
        entity('Q4', 'Unlisted', ['https://unlisted.com/']),
      ),
      popularity: ranked([
        ['a.com', 1],
        ['b.com', 2],
        ['c.com', 3],
      ]),
      limit: 1,
      pinned: new Set(['Q1', 'Q4']),
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.name)).toEqual(['A', 'C']);
  });

  it('ranks by best position in either list: CrUX top 1k (≈ rank 500) beats Majestic 600', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q1', 'Majestic', ['https://m.com/']),
        entity('Q2', 'CrUX', ['https://c.com/']),
      ),
      popularity: new Map([
        ['m.com', majesticOnly(600)],
        ['c.com', { bucket: 1_000, sources: ['crux'], majesticRank: null, cruxBucket: 1_000 }],
      ]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => [o.name, o.popularity?.bucket])).toEqual([
      ['CrUX', 1_000],
      ['Majestic', 1_000],
    ]);
  });

  it('keeps one organisation per primary domain, preferring the most sitelinks', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q9366', 'Google Search', ['https://www.google.com/'], { sitelinks: 90 }),
        entity('Q95', 'Google', ['https://www.google.com/'], { sitelinks: 150 }),
      ),
      popularity: ranked([['google.com', 1]]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.wikidataId)).toEqual(['Q95']);
  });

  it('prefers a notable organisation over a product or service with more sitelinks', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q9366', 'Google Search', ['https://www.google.com/'], {
          sitelinks: 130,
          isOrganisation: false,
        }),
        entity('Q95', 'Google', ['https://www.google.com/'], { sitelinks: 90 }),
      ),
      popularity: ranked([['google.com', 1]]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.name)).toEqual(['Google']);
  });

  it('does not let an obscure organisation that merely links the domain win', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q209330', 'Instagram', ['https://www.instagram.com/'], {
          sitelinks: 168,
          isOrganisation: false,
        }),
        entity('Q140386630', 'JKL Dolphins Kampala', ['https://instagram.com'], { sitelinks: 0 }),
      ),
      popularity: ranked([['instagram.com', 5]]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.name)).toEqual(['Instagram']);
  });

  it('lets a much better-known service win over a minor organisation with the same domain', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q918', 'X', ['https://twitter.com', 'https://x.com'], {
          sitelinks: 208,
          isOrganisation: false,
        }),
        entity('Q30686532', 'X.com', ['https://x.com/'], { sitelinks: 27 }),
      ),
      popularity: ranked([
        ['twitter.com', 7],
        ['x.com', 48],
      ]),
      limit: 500,
      confirmedAt: NOW,
    });
    // X.com's only domain is already one of X's official domains, so it is not listed separately.
    expect(orgs.map((o) => [o.name, o.primaryDomain, o.officialDomains])).toEqual([
      ['X', 'twitter.com', ['twitter.com', 'x.com']],
    ]);
  });

  it('counts a software product half, so a site or organisation with the domain wins', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q104889222', 'Snowflake ID', ['https://twitter.com/'], {
          sitelinks: 100,
          isOrganisation: false,
          isProduct: true,
        }),
        entity('Q918', 'X', ['https://twitter.com'], { sitelinks: 60, isOrganisation: false }),
      ),
      popularity: ranked([['twitter.com', 7]]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.name)).toEqual(['X']);
  });

  it('gives colliding names distinct slugs, the better-ranked one keeping the plain slug', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q20', 'Café Nero', ['https://nero.com/']),
        entity('Q10', 'Cafe Nero', ['https://cafenero.org/']),
      ),
      popularity: ranked([
        ['nero.com', 5],
        ['cafenero.org', 7],
      ]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.slug)).toEqual(['cafe-nero', 'cafe-nero-q10']);
  });
});
