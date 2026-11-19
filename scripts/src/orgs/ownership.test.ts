import { describe, expect, it } from 'vitest';
import { ownedFromEntities, ownershipSearches, queryOwnedViaApi } from './ownership';

/** A statement in `wbgetentities` JSON pointing at an item. */
function itemClaim(
  id: string,
  options: { rank?: string; qualifiers?: Record<string, unknown[]> } = {},
) {
  return {
    rank: options.rank ?? 'normal',
    mainsnak: { snaktype: 'value', datavalue: { value: { id }, type: 'wikibase-entityid' } },
    ...(options.qualifiers ? { qualifiers: options.qualifiers } : {}),
  };
}

function urlClaim(url: string, rank = 'normal') {
  return { rank, mainsnak: { snaktype: 'value', datavalue: { value: url, type: 'string' } } };
}

const ENDED = { P582: [{ snaktype: 'value' }] };
const MINORITY = {
  P1107: [{ snaktype: 'value', datavalue: { value: { amount: '+0.2' }, type: 'quantity' } }],
};

const ENTITIES = {
  entities: {
    Q95: {
      id: 'Q95',
      labels: { en: { value: 'Google' } },
      claims: {
        P355: [itemClaim('Q20'), itemClaim('Q21', { qualifiers: ENDED })],
        P856: [urlClaim('https://about.google/')],
      },
    },
    Q866: {
      id: 'Q866',
      labels: { en: { value: 'YouTube' } },
      claims: {
        P127: [itemClaim('Q95')],
        P856: [
          urlClaim('https://www.youtube.com/'),
          urlClaim('https://old.youtube.com/', 'deprecated'),
        ],
      },
    },
    Q20: {
      id: 'Q20',
      labels: {},
      claims: { P856: [urlClaim('https://deepmind.com/')] },
    },
    Q21: {
      id: 'Q21',
      labels: { en: { value: 'Motorola Mobility' } },
      claims: { P856: [urlClaim('https://motorola.com/')] },
    },
    Q22: {
      id: 'Q22',
      labels: { en: { value: 'Stake' } },
      claims: {
        P127: [itemClaim('Q95', { qualifiers: MINORITY })],
        P749: [itemClaim('Q95', { rank: 'deprecated' })],
        P856: [urlClaim('https://stake.example/')],
      },
    },
    Q23: { id: 'Q23', missing: '' },
  },
};

describe('ownedFromEntities', () => {
  it('links children by P127/P749 and parents by P355, ignoring ended, minority and deprecated links', () => {
    expect(ownedFromEntities(['Q95'], ENTITIES)).toEqual([
      {
        parentId: 'Q95',
        wikidataId: 'Q20',
        name: 'Q20',
        websites: ['https://deepmind.com/'],
      },
      {
        parentId: 'Q95',
        wikidataId: 'Q866',
        name: 'YouTube',
        websites: ['https://www.youtube.com/'],
      },
    ]);
  });
});

describe('ownershipSearches', () => {
  it('ORs the parents into CirrusSearch haswbstatement queries for items with a website', () => {
    expect(ownershipSearches(['Q1', 'Q2', 'Q3'], 2)).toEqual([
      'haswbstatement:P856 haswbstatement:P127=Q1|P749=Q1|P127=Q2|P749=Q2',
      'haswbstatement:P856 haswbstatement:P127=Q3|P749=Q3',
    ]);
  });
});

describe('queryOwnedViaApi', () => {
  it('returns what it can when some API responses are unavailable', async () => {
    const get = async (params: Record<string, string>) => {
      if (params.list === 'search') return { query: { search: [{ title: 'Q866' }] } };
      if (params.ids === 'Q95') return null; // not cached: parents (and their P355) unknown
      const ids = params.ids?.split('|') ?? [];
      return {
        entities: Object.fromEntries(
          Object.entries(ENTITIES.entities).filter(([id]) => ids.includes(id)),
        ),
      };
    };
    const owned = await queryOwnedViaApi(['Q95'], get);
    expect(owned.map((o) => o.wikidataId)).toEqual(['Q866']);
  });
});

describe('ownedFromEntities: lapsed and minority links (R1)', () => {
  const owned = (id: string, claims: Record<string, unknown[]>) => ({
    id,
    labels: { en: { value: id } },
    claims: { P856: [urlClaim(`https://${id.toLowerCase()}.example/`)], ...claims },
  });
  const VALUE = [{ snaktype: 'value', datavalue: { value: { time: '+2012-01-15T00:00:00Z' } } }];

  it('flags children that were dissolved (P576) or discontinued (P2669) as lapsed', () => {
    const json = {
      entities: {
        Q30: owned('Q30', { P127: [itemClaim('Q95')], P576: VALUE }),
        Q31: owned('Q31', { P127: [itemClaim('Q95')], P2669: VALUE }),
        Q32: owned('Q32', { P127: [itemClaim('Q95')] }),
      },
    };
    expect(ownedFromEntities(['Q95'], json).map((e) => [e.wikidataId, e.lapsed])).toEqual([
      ['Q30', true],
      ['Q31', true],
      ['Q32', undefined],
    ]);
  });

  it('flags an owner among more than two current owners as an investor, not a parent', () => {
    const json = {
      entities: {
        Q40: owned('Q40', {
          P127: [itemClaim('Q95'), itemClaim('Q1'), itemClaim('Q2'), itemClaim('Q3')],
        }),
        Q41: owned('Q41', { P127: [itemClaim('Q95'), itemClaim('Q1')] }),
      },
    };
    expect(ownedFromEntities(['Q95'], json).map((e) => [e.wikidataId, e.investor])).toEqual([
      ['Q40', true],
      ['Q41', undefined],
    ]);
  });

  it('ignores official websites that have an end time', () => {
    const json = {
      entities: {
        Q50: {
          id: 'Q50',
          labels: { en: { value: 'Shop' } },
          claims: {
            P127: [itemClaim('Q95')],
            P856: [
              { ...urlClaim('https://old-shop.example/'), qualifiers: ENDED },
              urlClaim('https://shop.example/'),
            ],
          },
        },
      },
    };
    expect(ownedFromEntities(['Q95'], json)[0]?.websites).toEqual(['https://shop.example/']);
  });
});
