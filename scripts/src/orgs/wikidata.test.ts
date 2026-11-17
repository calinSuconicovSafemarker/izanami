import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEntityQuery, parseEntityBindings } from './wikidata';

describe('buildEntityQuery', () => {
  it('looks entities up by the exact homepage IRIs of each domain', () => {
    const query = buildEntityQuery(['tudelft.nl']);
    expect(query).toContain('<https://www.tudelft.nl/>');
    expect(query).toContain('<http://tudelft.nl>');
    expect(query).toContain('wdt:P856');
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

  it('excludes Wikimedia list articles and humans in the query', () => {
    const query = buildEntityQuery(['example.com']);
    expect(query).toContain('wd:Q13406463');
    expect(query).toContain('wd:Q5 ');
  });

  it('drops entities without an English or multilingual label', () => {
    expect(parseEntityBindings(json).has('Q12345')).toBe(false);
  });

  it('rejects responses that are not SPARQL JSON', () => {
    expect(() => parseEntityBindings({ error: 'nope' })).toThrow(/SPARQL/);
  });
});
