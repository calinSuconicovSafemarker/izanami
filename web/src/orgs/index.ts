import orgsJson from '../data/orgs.json';
import { parseVariant } from '../domain';
import type { OrgInput } from '../rules';
import type { Org } from './org';

export type { Org } from './org';

/** All organisations, best Tranco rank first. */
export const allOrgs: readonly Org[] = orgsJson;

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

/** Rules-engine input; the brand label is the primary domain's registrable label. */
export function toOrgInput(org: Org): OrgInput {
  return {
    slug: org.slug,
    name: org.name,
    country: org.country ?? '',
    primaryDomain: org.primaryDomain,
    officialDomains: org.officialDomains,
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
