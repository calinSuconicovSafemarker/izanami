import { describe, expect, it } from 'vitest';
import {
  addRelatedDomains,
  parsePublishedList,
  parsePublishedListsConfig,
  type OwnedEntity,
  type PublishedListConfig,
} from './related';
import type { Org } from './select';

function org(id: string, name: string, domains: string[], rank: number): Org {
  return {
    slug: name.toLowerCase(),
    name,
    wikidataId: id,
    country: null,
    primaryDomain: domains[0]!,
    officialDomains: domains,
    relatedDomains: [],
    brandTlds: [],
    wikidataDomain: domains[0]!,
    trancoRank: rank,
    confirmedAt: '2026-11-19',
  };
}

const GOOGLE = org('Q95', 'Google', ['google.com', 'google.nl'], 1);
const YOUTUBE = org('Q866', 'YouTube', ['youtube.com'], 10);
const ACME = org('Q1', 'Acme', ['acme.com'], 50);

const TRANCO = new Map(
  ['google.com', 'youtube.com', 'gmail.com', 'deepmind.com', 'acme.com', 'waze.com'].map((d, i) => [
    d,
    i + 1,
  ]),
);

const owned = (
  parentId: string,
  wikidataId: string,
  name: string,
  ...websites: string[]
): OwnedEntity => ({
  parentId,
  wikidataId,
  name,
  websites,
});

const related = (orgs: Org[], id: string) =>
  orgs.find((o) => o.wikidataId === id)?.relatedDomains.map((r) => [r.domain, r.source, r.via]);

describe('addRelatedDomains', () => {
  it("adds owned entities' websites, including another org's site when that org is owned", () => {
    const { orgs } = addRelatedDomains([GOOGLE, YOUTUBE, ACME], TRANCO, {
      owned: [
        owned('Q95', 'Q866', 'YouTube', 'https://www.youtube.com/'),
        owned('Q95', 'Q9334', 'Gmail', 'https://gmail.com/', 'https://mail.google.com/'),
      ],
    });
    expect(related(orgs, 'Q95')).toEqual([
      ['gmail.com', 'wikidata-owned', 'Gmail'],
      ['youtube.com', 'wikidata-owned', 'YouTube'],
    ]);
    expect(orgs.find((o) => o.wikidataId === 'Q95')?.relatedDomains[0]?.url).toBe(
      'https://www.wikidata.org/wiki/Q9334',
    );
    expect(related(orgs, 'Q866')).toEqual([]);
  });

  it("keeps a curated entry for an owned org's official domain at the curated trust level", () => {
    const { orgs } = addRelatedDomains([GOOGLE, YOUTUBE], TRANCO, {
      owned: [owned('Q95', 'Q866', 'YouTube Inc.')],
      curated: [{ wikidataId: 'Q95', domain: 'youtube.com', url: 'https://example.org/yt' }],
    });
    expect(orgs[0]?.relatedDomains).toEqual([
      { domain: 'youtube.com', source: 'curated', via: 'YouTube', url: 'https://example.org/yt' },
    ]);
  });

  it("keeps a published-list entry for an owned org's official domain at its trust level", () => {
    const { orgs } = addRelatedDomains([GOOGLE, YOUTUBE], TRANCO, {
      owned: [owned('Q95', 'Q866', 'YouTube Inc.')],
      published: [
        {
          wikidataId: 'Q95',
          name: 'Google list',
          url: 'https://example.org/list',
          domains: ['youtube.com'],
        },
      ],
    });
    expect(related(orgs, 'Q95')).toEqual([['youtube.com', 'published-list', 'Google list']]);
  });

  it('credits a curated ownership link with its source', () => {
    // A Wikidata-found domain reached through a curated ownership link is curated too.
    const gco = org('Q5512639', 'g.co', ['g.co'], 900);
    const { orgs } = addRelatedDomains([GOOGLE, gco], new Map([...TRANCO, ['g.co', 900]]), {
      owned: [
        {
          parentId: 'Q95',
          wikidataId: 'Q5512639',
          name: 'g.co',
          websites: [],
          source: 'https://example.org/gco',
        },
        owned('Q5512639', 'Q7', 'g.co shortener', 'https://g.co/'),
      ],
    });
    expect(orgs[0]?.relatedDomains).toEqual([
      { domain: 'g.co', source: 'curated', via: 'g.co', url: 'https://example.org/gco' },
    ]);
  });

  it('follows ownership two levels deep, but not three', () => {
    const { orgs } = addRelatedDomains([GOOGLE], TRANCO, {
      owned: [
        owned('Q95', 'Q10', 'Google Ventures'),
        owned('Q10', 'Q11', 'DeepMind', 'https://deepmind.com/'),
        owned('Q11', 'Q12', 'Waze', 'https://waze.com/'),
      ],
    });
    expect(related(orgs, 'Q95')).toEqual([['deepmind.com', 'wikidata-owned', 'DeepMind']]);
  });

  it('drops Wikidata domains without a Tranco rank and pages on other platforms', () => {
    const { orgs } = addRelatedDomains([GOOGLE], TRANCO, {
      owned: [
        owned('Q95', 'Q20', 'Obscure', 'https://obscure-unranked.com/'),
        owned('Q95', 'Q21', 'Blog', 'https://acme.com/google-blog'),
      ],
    });
    expect(related(orgs, 'Q95')).toEqual([]);
  });

  it("skips a domain that is an unrelated org's official domain", () => {
    const { orgs, skipped } = addRelatedDomains([GOOGLE, ACME], TRANCO, {
      owned: [owned('Q95', 'Q30', 'Partner', 'https://acme.com/')],
      curated: [{ wikidataId: 'Q95', domain: 'acme.com', url: 'https://example.org/claim' }],
    });
    expect(related(orgs, 'Q95')).toEqual([]);
    expect(skipped).toEqual([
      {
        orgId: 'Q95',
        domain: 'acme.com',
        source: 'curated',
        reason: 'official domain of Acme (Q1)',
      },
    ]);
  });

  it('gives a domain reached by two orgs to the nearer owner only', () => {
    const alphabet = org('Q2', 'Alphabet', ['abc.xyz'], 5);
    const { orgs } = addRelatedDomains([GOOGLE, alphabet], TRANCO, {
      owned: [
        owned('Q2', 'Q95', 'Google', 'https://www.google.com/'),
        owned('Q95', 'Q9334', 'Gmail', 'https://gmail.com/'),
        owned('Q2', 'Q11', 'DeepMind', 'https://deepmind.com/'),
        owned('Q95', 'Q11', 'DeepMind', 'https://deepmind.com/'),
      ],
    });
    expect(related(orgs, 'Q95')).toEqual([
      ['deepmind.com', 'wikidata-owned', 'DeepMind'],
      ['gmail.com', 'wikidata-owned', 'Gmail'],
    ]);
    // gmail.com is nearer to Google; DeepMind is a tie, so the better-ranked org wins.
    expect(related(orgs, 'Q2')).toEqual([['google.com', 'wikidata-owned', 'Google']]);
  });

  it('adds published-list and curated domains (no Tranco needed), curated winning over both', () => {
    const { orgs } = addRelatedDomains([GOOGLE], TRANCO, {
      owned: [owned('Q95', 'Q9334', 'Gmail', 'https://gmail.com/')],
      published: [
        {
          wikidataId: 'Q95',
          name: 'Google supported domains',
          url: 'https://www.google.com/supported_domains',
          domains: ['google.nl', 'google.ad', 'gmail.com'],
        },
      ],
      curated: [
        { wikidataId: 'Q95', domain: 'g.co', url: 'https://example.org/g' },
        { wikidataId: 'Q95', domain: 'gmail.com', url: 'https://example.org/gmail' },
      ],
    });
    expect(related(orgs, 'Q95')).toEqual([
      ['g.co', 'curated', undefined],
      ['gmail.com', 'curated', undefined],
      ['google.ad', 'published-list', 'Google supported domains'],
    ]);
  });

  it('drops domains where anyone can host content, unless curated by hand', () => {
    const { orgs, skipped } = addRelatedDomains([GOOGLE], new Map([['appspot.com', 9]]), {
      owned: [owned('Q95', 'Q40', 'App Engine', 'https://appspot.com/')],
      published: [
        {
          wikidataId: 'Q95',
          name: 'List',
          url: 'https://example.org/list',
          domains: ['googleapis.com'],
        },
      ],
      curated: [{ wikidataId: 'Q95', domain: 'withgoogle.com', url: 'https://example.org/w' }],
    });
    expect(related(orgs, 'Q95')).toEqual([['withgoogle.com', 'curated', undefined]]);
    expect(skipped).toEqual([
      {
        orgId: 'Q95',
        domain: 'googleapis.com',
        source: 'published-list',
        reason: 'shared hosting (Public Suffix List private section)',
      },
    ]);
  });
});

const MS_LIST: PublishedListConfig = {
  wikidataId: 'Q2283',
  name: 'Microsoft 365 URLs and IP address ranges',
  url: 'https://endpoints.office.com/endpoints/worldwide?clientrequestid=00000000-0000-4000-8000-000000000000',
  docs: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-ip-web-service',
  parser: 'microsoft-365-endpoints',
  excludeEndpointIds: [125],
  excludeDomains: ['akamaihd.net'],
};

describe('parsePublishedList', () => {
  it('reads one domain per line, normalised to registrable domains', () => {
    const config: PublishedListConfig = {
      ...MS_LIST,
      wikidataId: 'Q95',
      parser: 'domain-lines',
      excludeEndpointIds: undefined,
      excludeDomains: undefined,
    };
    expect(parsePublishedList(config, '.google.com\n.google.co.uk\r\n\n.www.google.ad\n')).toEqual([
      'google.ad',
      'google.co.uk',
      'google.com',
    ]);
  });

  it('reads Microsoft 365 endpoint URLs, skipping excluded endpoint sets and domains', () => {
    const body = JSON.stringify([
      { id: 1, urls: ['outlook.office.com', '*.outlook.com'] },
      { id: 37, urls: ['*.akamaihd.net', 'sharepoint.com'] },
      { id: 125, urls: ['*.digicert.com', 'crl.globalsign.com'] },
      { id: 200, ips: ['1.2.3.4/32'] },
      { id: 201, urls: ['*.*.office.net'] },
    ]);
    expect(parsePublishedList(MS_LIST, body)).toEqual([
      'office.com',
      'office.net',
      'outlook.com',
      'sharepoint.com',
    ]);
  });
});

describe('parsePublishedListsConfig', () => {
  it('accepts a valid config and rejects an unknown parser', () => {
    expect(parsePublishedListsConfig([MS_LIST])).toEqual([MS_LIST]);
    expect(() => parsePublishedListsConfig([{ ...MS_LIST, parser: 'html' }])).toThrow(/parser/);
  });
});

describe('addRelatedDomains: lapsed and investor links (R1)', () => {
  it('neither adds nor follows lapsed or investor-only entities', () => {
    const { orgs } = addRelatedDomains([GOOGLE], TRANCO, {
      owned: [
        { ...owned('Q95', 'Q30', 'Dead startup', 'https://deepmind.com/'), lapsed: true },
        owned('Q30', 'Q31', 'Its child', 'https://waze.com/'),
        { ...owned('Q95', 'Q40', 'Portfolio company', 'https://acme.com/'), investor: true },
        owned('Q95', 'Q9334', 'Gmail', 'https://gmail.com/'),
      ],
    });
    expect(related(orgs, 'Q95')).toEqual([['gmail.com', 'wikidata-owned', 'Gmail']]);
  });
});
