import { describe, expect, it } from 'vitest';
import { runOrgsPipeline, type OrgsSources } from './pipeline';
import type { Org } from './select';
import type { WikidataEntity } from './wikidata';

const ENTITIES: WikidataEntity[] = [
  {
    wikidataId: 'Q95',
    name: 'Google',
    sitelinks: 150,
    isOrganisation: false,
    isProduct: false,
    classes: ['Q4830453'],
    countries: ['US'],
    websites: ['https://www.google.com/'],
  },
  {
    wikidataId: 'Q2',
    name: 'Unranked Org',
    sitelinks: 5,
    isOrganisation: false,
    isProduct: false,
    classes: [],
    countries: [],
    websites: ['https://unranked.org/'],
  },
];

function sources(
  previous: Org[] | null,
): OrgsSources & { queried: string[][]; ownedQueried: string[][] } {
  const queried: string[][] = [];
  const ownedQueried: string[][] = [];
  return {
    queried,
    ownedQueried,
    trancoCsv: async () => '1,google.com\n2,www.google.com\n3,tudelft.nl\n4,youtube.com\n',
    queryEntities: async (domains) => {
      queried.push([...domains]);
      return new Map(ENTITIES.map((e) => [e.wikidataId, e]));
    },
    queryClassAncestors: async (classes) =>
      new Map(classes.map((c) => [c, c === 'Q4830453' ? [c, 'Q43229'] : [c]])),
    extras: async () => [
      {
        wikidataId: 'Q752663',
        slug: 'tu-delft',
        name: 'Delft University of Technology',
        country: 'NL',
        primaryDomain: 'tudelft.nl',
        officialDomains: ['tudelft.nl'],
        source: 'https://www.wikidata.org/wiki/Q752663#P856',
      },
      {
        wikidataId: 'Q95',
        name: 'Google',
        relatedDomains: [{ domain: 'g.co', source: 'https://example.org/g.co' }],
      },
    ],
    queryOwned: async (parents) => {
      ownedQueried.push([...parents]);
      return parents.includes('Q95')
        ? [{ parentId: 'Q95', wikidataId: 'Q10', name: 'Google Products', websites: [] }]
        : [
            {
              parentId: 'Q10',
              wikidataId: 'Q866',
              name: 'YouTube',
              websites: ['https://www.youtube.com/'],
            },
          ];
    },
    publishedLists: async () => [
      {
        wikidataId: 'Q95',
        name: 'Google supported domains',
        url: 'https://www.google.com/supported_domains',
        domains: ['google.ad', 'google.com'],
      },
    ],
    previousOrgs: async () => previous,
  };
}

const OPTIONS = {
  candidateDomains: 2,
  limit: 500,
  batchSize: 1,
  classBatchSize: 100,
  ownedBatchSize: 100,
  confirmedAt: '2026-11-17',
};

describe('runOrgsPipeline', () => {
  it('queries Wikidata in batches of Tranco domains and keeps only Tranco-confirmed orgs plus extras', async () => {
    const src = sources(null);
    const { orgs } = await runOrgsPipeline(src, OPTIONS);
    expect(src.queried).toEqual([['google.com'], ['tudelft.nl']]);
    expect(orgs.map((o) => [o.slug, o.primaryDomain, o.trancoRank])).toEqual([
      ['google', 'google.com', 1],
      ['tu-delft', 'tudelft.nl', 3],
    ]);
  });

  it('produces an empty diff when re-run with unchanged inputs', async () => {
    const first = await runOrgsPipeline(sources(null), OPTIONS);
    expect(first.diffMarkdown).toContain('## Added (2)');
    const second = await runOrgsPipeline(sources(first.orgs), {
      ...OPTIONS,
      confirmedAt: '2026-12-01',
    });
    expect(second.diffMarkdown).toBe('# Data diff\n\nNo changes since the previous `orgs.json`.\n');
  });

  it('adds related domains from two ownership levels, published lists and curated extras', async () => {
    const src = sources(null);
    const { orgs, diffMarkdown } = await runOrgsPipeline(src, OPTIONS);
    expect(src.ownedQueried).toEqual([['Q95', 'Q752663'], ['Q10']]);
    expect(orgs[0]?.relatedDomains.map((r) => [r.domain, r.source])).toEqual([
      ['g.co', 'curated'],
      ['google.ad', 'published-list'],
      ['youtube.com', 'wikidata-owned'],
    ]);
    expect(diffMarkdown).toContain('+youtube.com (wikidata-owned: YouTube)');
  });
});

describe('runOrgsPipeline with a partial ownership crawl', () => {
  it('says so in the data diff', async () => {
    const src = { ...sources(null), ownershipGaps: () => 3 };
    const { diffMarkdown } = await runOrgsPipeline(src, OPTIONS);
    expect(diffMarkdown).toContain(
      'Ownership crawl partial: 3 Wikidata API responses were unavailable',
    );
  });
});
