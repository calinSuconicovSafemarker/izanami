import orgsJson from '../data/orgs.json';
import { parseVariant } from '../domain';
import type { OrgInput } from '../rules';
import type { Org, RelatedDomain, RelatedSource } from './org';

export type { Org, RelatedDomain, RelatedSource } from './org';

const RELATED_SOURCES: readonly RelatedSource[] = ['wikidata-owned', 'published-list', 'curated'];

/** JSON imports widen string unions to `string`; check the related-domain source instead of casting. */
function relatedSource(source: string): RelatedSource {
  const known = RELATED_SOURCES.find((s) => s === source);
  if (!known) throw new Error(`orgs.json: unknown related-domain source "${source}"`);
  return known;
}

/** All organisations, best Tranco rank first. */
export const allOrgs: readonly Org[] = orgsJson.map((org) => ({
  ...org,
  relatedDomains: org.relatedDomains.map((r) => ({ ...r, source: relatedSource(r.source) })),
}));

const bySlug = new Map(allOrgs.map((org) => [org.slug, org]));

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
 * Rules-engine input; the brand label is the primary domain's registrable label. Related domains
 * (products, subsidiaries, vendor lists) count as official for matching (ticket 15).
 */
export function toOrgInput(org: Org): OrgInput {
  return {
    slug: org.slug,
    name: org.name,
    country: org.country ?? '',
    primaryDomain: org.primaryDomain,
    officialDomains: [...org.officialDomains, ...org.relatedDomains.map((r) => r.domain)],
    brandLabel: parseVariant(org.primaryDomain).label,
  };
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

const GROUP_TITLES: readonly [RelatedSource, string][] = [
  ['wikidata-owned', 'Products & subsidiaries'],
  ['published-list', 'Published by the company'],
  ['curated', 'Curated'],
];

/** Related domains grouped by source, in display order; empty groups are left out. */
export function relatedDomainGroups(org: Org): RelatedDomainGroup[] {
  return GROUP_TITLES.map(([source, title]) => ({
    source,
    title,
    domains: org.relatedDomains.filter((r) => r.source === source),
  })).filter((g) => g.domains.length > 0);
}
