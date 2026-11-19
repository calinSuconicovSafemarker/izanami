import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildClassQuery,
  buildEntityQuery,
  classifyEntities,
  parseClassAncestors,
  parseEntityBindings,
  type WikidataEntity,
} from './wikidata';

describe('buildEntityQuery', () => {
  it('looks entities up by the exact homepage IRIs of each domain', () => {
    const query = buildEntityQuery(['tudelft.nl']);
    expect(query).toContain('<https://www.tudelft.nl/>');
    expect(query).toContain('<http://tudelft.nl>');
    expect(query).toContain('P856');
    expect(query).toContain('wdt:P297');
  });
});

describe('parseEntityBindings', () => {
  const json: unknown = JSON.parse(
    readFileSync(new URL('./fixtures/sparql-sample.json', import.meta.url), 'utf8'),
  );

  it('groups rows per entity with all official websites and countries', () => {
    const entities = parseEntityBindings(json);
    expect(entities.get('Q752663')).toEqual({
      wikidataId: 'Q752663',
      name: 'Delft University of Technology',
      sitelinks: 70,
      isOrganisation: false,
      isProduct: false,
      classes: ['Q3918'],
      countries: ['NL'],
      websites: ['https://www.tudelft.nl/', 'https://www.tudelft.nl/en/'],
    });
    expect(entities.get('Q95')?.websites).toEqual(['https://www.google.com/']);
  });

  it('falls back to the multilingual label and to the headquarters country', () => {
    expect(parseEntityBindings(json).get('Q209330')).toMatchObject({
      name: 'Instagram',
      countries: ['IE', 'US'],
    });
  });

  it('prefers P17 countries over headquarters countries', () => {
    const rows = {
      results: {
        bindings: [
          {
            item: { value: 'http://www.wikidata.org/entity/Q1' },
            label: { value: 'Acme' },
            iso: { value: 'NL' },
            hqIso: { value: 'US' },
          },
        ],
      },
    };
    expect(parseEntityBindings(rows).get('Q1')?.countries).toEqual(['NL']);
  });

  it('collects the direct classes of each entity', () => {
    expect(parseEntityBindings(json).get('Q209330')?.classes).toEqual(['Q3220391']);
  });

  it('matches every non-deprecated P856, not only the preferred one (X keeps twitter.com)', () => {
    const query = buildEntityQuery(['twitter.com']);
    expect(query).toContain('p:P856');
    expect(query).toContain('wikibase:DeprecatedRank');
    expect(query).not.toContain('wdt:P856');
  });

  it('falls back to the country of origin when there is no country or headquarters', () => {
    const rows = {
      results: {
        bindings: [
          {
            item: { value: 'http://www.wikidata.org/entity/Q866' },
            label: { value: 'YouTube' },
            originIso: { value: 'US' },
          },
        ],
      },
    };
    expect(parseEntityBindings(rows).get('Q866')?.countries).toEqual(['US']);
    expect(buildEntityQuery(['youtube.com'])).toContain('wdt:P495');
  });

  it('drops entities without an English or multilingual label', () => {
    expect(parseEntityBindings(json).has('Q12345')).toBe(false);
  });

  it('rejects responses that are not SPARQL JSON', () => {
    expect(() => parseEntityBindings({ error: 'nope' })).toThrow(/SPARQL/);
  });
});

describe('class ancestry', () => {
  const entity = (id: string, name: string, classes: string[], sitelinks = 10): WikidataEntity => ({
    wikidataId: id,
    name,
    sitelinks,
    isOrganisation: false,
    isProduct: false,
    classes,
    countries: [],
    websites: [],
  });
  const row = (cls: string, sup: string) => ({
    class: { value: `http://www.wikidata.org/entity/${cls}` },
    super: { value: `http://www.wikidata.org/entity/${sup}` },
  });

  it('asks for every superclass of the given classes', () => {
    const query = buildClassQuery(['Q341', 'Q3918']);
    expect(query).toContain('wd:Q341 wd:Q3918');
    expect(query).toContain('wdt:P279*');
  });

  it('groups superclass rows per class', () => {
    const ancestors = parseClassAncestors({
      results: { bindings: [row('Q341', 'Q341'), row('Q341', 'Q7397'), row('Q3918', 'Q43229')] },
    });
    expect(ancestors.get('Q341')).toEqual(['Q341', 'Q7397']);
    expect(ancestors.get('Q3918')).toEqual(['Q43229']);
  });

  it('marks organisations and software/concept products, and drops lists', () => {
    const ancestors = new Map([
      ['Q3918', ['Q3918', 'Q43229']], // university → organisation
      ['Q341', ['Q341', 'Q7397']], // free software → software
      ['Q4182287', ['Q4182287', 'Q7397', 'Q151885']], // web search engine → software, concept
      ['Q3220391', ['Q3220391', 'Q35127', 'Q7397', 'Q151885']], // social network → website, …
      ['Q4679321c', ['Q13406463']], // Wikimedia list
    ]);
    const kept = classifyEntities(
      new Map([
        ['Q752663', entity('Q752663', 'Delft University of Technology', ['Q3918'])],
        ['Q104889222', entity('Q104889222', 'Snowflake ID', ['Q341'])],
        ['Q9366', entity('Q9366', 'Google Search', ['Q4182287'])],
        ['Q918', entity('Q918', 'X', ['Q3220391'])],
        ['Q4679321', entity('Q4679321', 'list of Google domains', ['Q4679321c'])],
      ]),
      ancestors,
    );
    expect([...kept.values()].map((e) => [e.name, e.isOrganisation, e.isProduct])).toEqual([
      ['Delft University of Technology', true, false],
      ['Snowflake ID', false, true],
      ['Google Search', false, true],
      ['X', false, false],
    ]);
  });

  it('drops countries, states and administrative regions even when classed as organisations', () => {
    const ancestors = new Map([
      ['Q3624078', ['Q3624078', 'Q7275', 'Q43229']], // sovereign state → state → organisation
      ['Q6256', ['Q6256']], // country
      ['Q1221156', ['Q1221156', 'Q1048835']], // state of Germany → political territorial entity
      ['Q910252', ['Q910252', 'Q56061', 'Q43229']], // ministry → … administrative entity, org
      ['Q3918', ['Q3918', 'Q43229']],
    ]);
    const kept = classifyEntities(
      new Map([
        ['Q183', entity('Q183', 'Germany', ['Q3624078', 'Q6256'])],
        ['Q980', entity('Q980', 'Bavaria', ['Q1221156'])],
        ['Q501542', entity('Q501542', 'United States Department of Agriculture', ['Q910252'])],
        ['Q752663', entity('Q752663', 'Delft University of Technology', ['Q3918'])],
      ]),
      ancestors,
    );
    expect([...kept.keys()].sort()).toEqual(['Q501542', 'Q752663']);
  });
});
