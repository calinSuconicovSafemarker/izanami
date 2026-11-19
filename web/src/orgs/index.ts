import orgsJson from '../data/orgs.json';
import { normaliseTld } from '../domain';
import type { OrgInput } from '../rules';
import { officialContext } from './official';
import type {
  Org,
  Popularity,
  PopularityBucket,
  PopularitySource,
  RelatedDomain,
  RelatedSource,
} from './org';

export type {
  Org,
  Popularity,
  PopularityBucket,
  PopularitySource,
  RelatedDomain,
  RelatedSource,
} from './org';
export {
  isOfficialSource,
  OFFICIAL_SOURCES,
  officialContext,
  type OfficialContext,
} from './official';

const RELATED_SOURCES: readonly RelatedSource[] = ['wikidata-owned', 'published-list', 'curated'];

/** JSON imports widen string unions to `string`; check the related-domain source instead of casting. */
function relatedSource(source: string): RelatedSource {
  const known = RELATED_SOURCES.find((s) => s === source);
  if (!known) throw new Error(`orgs.json: unknown related-domain source "${source}"`);
  return known;
}

const POPULARITY_BUCKETS: readonly PopularityBucket[] = [1_000, 10_000, 100_000, 1_000_000];
const POPULARITY_SOURCES: readonly PopularitySource[] = ['crux', 'majestic'];

/** JSON imports widen the bucket and source unions too; check them the same way. */
function popularity(
  p: {
    bucket: number;
    sources: string[];
    majesticRank: number | null;
    cruxBucket: number | null;
  } | null,
): Popularity | null {
  if (!p) return null;
  const bucket = POPULARITY_BUCKETS.find((b) => b === p.bucket);
  if (!bucket) throw new Error(`orgs.json: unknown popularity bucket ${p.bucket}`);
  const cruxBucket = POPULARITY_BUCKETS.find((b) => b === p.cruxBucket) ?? null;
  const sources = p.sources.map((s) => {
    const known = POPULARITY_SOURCES.find((k) => k === s);
    if (!known) throw new Error(`orgs.json: unknown popularity source "${s}"`);
    return known;
  });
  return { bucket, sources, majesticRank: p.majesticRank, cruxBucket };
}

/** All organisations, most popular first. */
export const allOrgs: readonly Org[] = orgsJson.map((org) => ({
  ...org,
  relatedDomains: org.relatedDomains.map((r) => ({ ...r, source: relatedSource(r.source) })),
  popularity: popularity(org.popularity),
}));

const POPULARITY_SOURCE_NAMES: Record<PopularitySource, string> = {
  crux: 'Chrome UX Report',
  majestic: 'Majestic Million',
};

/** Evidence line, e.g. "Top 1,000 sites (Chrome UX Report, Majestic Million) — heavily used". */
export function popularityEvidence(p: Popularity): string {
  const names = p.sources.map((s) => POPULARITY_SOURCE_NAMES[s]).join(', ');
  return `Top ${p.bucket.toLocaleString('en-US')} sites (${names}) — heavily used`;
}

const bySlug = new Map(allOrgs.map((org) => [org.slug, org]));

/** Build date (YYYY-MM-DD) of the bundled data: the latest `confirmedAt` in `orgs.json`. */
export const dataVersion: string = allOrgs.reduce(
  (latest, org) => (org.confirmedAt > latest ? org.confirmedAt : latest),
  '',
);

export function getOrg(slug: string): Org | undefined {
  return bySlug.get(slug);
}

/** Curated extras are not confirmed by Wikidata's P856 domain match (ADR-0002). */
export function isCurated(org: Org): boolean {
  return org.wikidataDomain === null;
}

export function wikidataUrl(org: Org): string {
  return `https://www.wikidata.org/wiki/${org.wikidataId}`;
}

/**
 * Rules-engine input from the org's official context: Official-level domains (own sites,
 * published and curated related domains, brand TLDs) and the Wikidata-listed ones (R1).
 */
export function toOrgInput(org: Org): OrgInput {
  const ctx = officialContext(org);
  return {
    slug: org.slug,
    name: org.name,
    country: org.country ?? '',
    primaryDomain: org.primaryDomain,
    officialDomains: ctx.officialDomains,
    relatedOwned: ctx.relatedOwned,
    brandTlds: ctx.brandTlds,
    brandLabel: ctx.brandLabel,
  };
}

const tldOwners = new Map<string, string[]>();
for (const org of allOrgs) {
  for (const tld of officialContext(org).brandTlds) {
    tldOwners.set(tld, [...(tldOwners.get(tld) ?? []), org.name]);
  }
}

/** Names of the organisations that run `tld` as a brand TLD (several when shared, R4). */
export function brandTldOwners(tld: string): readonly string[] {
  return tldOwners.get(normaliseTld(tld)) ?? [];
}

/** Instant client-side filter by name or any official domain. */
export function searchOrgs(query: string): readonly Org[] {
  const q = query.trim().toLowerCase();
  if (!q) return allOrgs;
  return allOrgs.filter(
    (org) => org.name.toLowerCase().includes(q) || org.officialDomains.some((d) => d.includes(q)),
  );
}

export interface RelatedDomainGroup {
  source: RelatedSource;
  title: string;
  domains: readonly RelatedDomain[];
}

/** Group titles name the trust level (R1): Official, or listed and verified at lookup. */
const GROUP_TITLES: readonly [RelatedSource, (org: Org) => string][] = [
  ['published-list', (org) => `Official (published by ${org.name})`],
  ['curated', () => 'Official (curated, with source)'],
  ['wikidata-owned', () => 'Owned per Wikidata — verified at lookup'],
];

/** Related domains grouped by source, Official levels first; empty groups are left out. */
export function relatedDomainGroups(org: Org): RelatedDomainGroup[] {
  return GROUP_TITLES.map(([source, title]) => ({
    source,
    title: title(org),
    domains: org.relatedDomains.filter((r) => r.source === source),
  })).filter((g) => g.domains.length > 0);
}
