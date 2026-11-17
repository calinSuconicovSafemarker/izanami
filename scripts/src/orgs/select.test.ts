import { describe, expect, it } from 'vitest';
import { selectOrgs } from './select';
import type { WikidataEntity } from './wikidata';

const NOW = '2026-11-17';

function entity(id: string, name: string, websites: string[], extra: Partial<WikidataEntity> = {}) {
  return {
    wikidataId: id,
    name,
    sitelinks: 10,
    isOrganisation: true,
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
  it('excludes an entity whose official domain has no Tranco rank', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q1', 'Ranked Corp', ['https://ranked.com/']),
        entity('Q2', 'Obscure Society', ['https://obscure-society.org/']),
      ),
      tranco: new Map([['ranked.com', 42]]),
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
      tranco: new Map([
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
      wikidataDomain: 'tudelft.nl',
      trancoRank: 300,
      confirmedAt: NOW,
    });
  });

  it('keeps the top N by Tranco rank, best first', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q1', 'C', ['https://c.com/']),
        entity('Q2', 'A', ['https://a.com/']),
        entity('Q3', 'B', ['https://b.com/']),
      ),
      tranco: new Map([
        ['a.com', 1],
        ['b.com', 2],
        ['c.com', 3],
      ]),
      limit: 2,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.name)).toEqual(['A', 'B']);
  });

  it('keeps one organisation per primary domain, preferring the most sitelinks', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q9366', 'Google Search', ['https://www.google.com/'], { sitelinks: 90 }),
        entity('Q95', 'Google', ['https://www.google.com/'], { sitelinks: 150 }),
      ),
      tranco: new Map([['google.com', 1]]),
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
      tranco: new Map([['google.com', 1]]),
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
      tranco: new Map([['instagram.com', 5]]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.name)).toEqual(['Instagram']);
  });

  it('gives colliding names distinct slugs, the better-ranked one keeping the plain slug', () => {
    const orgs = selectOrgs({
      entities: entities(
        entity('Q20', 'Café Nero', ['https://nero.com/']),
        entity('Q10', 'Cafe Nero', ['https://cafenero.org/']),
      ),
      tranco: new Map([
        ['nero.com', 5],
        ['cafenero.org', 7],
      ]),
      limit: 500,
      confirmedAt: NOW,
    });
    expect(orgs.map((o) => o.slug)).toEqual(['cafe-nero', 'cafe-nero-q10']);
  });
});
