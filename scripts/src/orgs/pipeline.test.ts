import { describe, expect, it } from 'vitest';
import { runOrgsPipeline, type OrgsSources } from './pipeline';
import type { Org } from './select';
import type { WikidataEntity } from './wikidata';

const ENTITIES: WikidataEntity[] = [
  {
    wikidataId: 'Q95',
    name: 'Google',
    sitelinks: 150,
    countries: ['US'],
    websites: ['https://www.google.com/'],
  },
  {
    wikidataId: 'Q2',
    name: 'Unranked Org',
    sitelinks: 5,
    countries: [],
    websites: ['https://unranked.org/'],
  },
];

function sources(previous: Org[] | null): OrgsSources & { queried: string[][] } {
  const queried: string[][] = [];
  return {
    queried,
    pslText: async () => 'com\nnl\norg\n',
    trancoCsv: async () => '1,google.com\n2,www.google.com\n3,tudelft.nl\n',
    queryEntities: async (domains) => {
      queried.push([...domains]);
      return new Map(ENTITIES.map((e) => [e.wikidataId, e]));
    },
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
    ],
    previousOrgs: async () => previous,
  };
}

const OPTIONS = { candidateDomains: 10, limit: 500, batchSize: 1, confirmedAt: '2026-11-17' };

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
});
