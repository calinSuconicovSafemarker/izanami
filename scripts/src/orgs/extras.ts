import { registrableDomain } from '../lib/domain';
import type { CuratedDomain, OwnedEntity } from './related';
import { assignSlugs, compareOrgs, type Org } from './select';

/** A curated related domain (ticket 15) and the URL backing the claim. */
export interface CuratedRelated {
  domain: string;
  source: string;
}

/**
 * A curated ownership link: the extra's organisation owns this Wikidata entity (Google owns the
 * g.co item, Microsoft makes Windows), where Wikidata has no P127/P749/P355 link.
 */
export interface CuratedOwnership {
  wikidataId: string;
  name: string;
  source: string;
}

/** A hand-curated organisation of `scripts/data/extras.json`; exempt from the Tranco check (ADR-0002). */
export interface OrgExtra {
  wikidataId: string;
  slug?: string;
  name: string;
  country?: string | null;
  primaryDomain: string;
  officialDomains: string[];
  /** URL backing the claim that these domains are official. Required. */
  source: string;
  relatedDomains?: CuratedRelated[];
  owns?: CuratedOwnership[];
}

/** An entry that only adds curated related domains to an organisation (by its Q-id). */
export interface RelatedOnlyExtra {
  wikidataId: string;
  /** For the human reader of extras.json only. */
  name: string;
  relatedDomains?: CuratedRelated[];
  owns?: CuratedOwnership[];
}

export type Extra = OrgExtra | RelatedOnlyExtra;

const isOrgExtra = (extra: Extra): extra is OrgExtra => 'primaryDomain' in extra;

const HTTP_URL = /^https?:\/\/\S+$/;

/** Validates the parsed `extras.json` content. */
export function parseExtras(json: unknown): Extra[] {
  if (!Array.isArray(json)) throw new Error('extras.json must be an array');
  return json.map((raw: Partial<OrgExtra>, i) => {
    const where = `extras.json[${i}]`;
    if (!raw.wikidataId || !/^Q\d+$/.test(raw.wikidataId))
      throw new Error(`${where}: wikidataId must be a Q-id`);
    if (!raw.name) throw new Error(`${where}: name is required`);
    raw.relatedDomains?.forEach((r, j) => {
      if (!r.domain || registrableDomain(r.domain) !== r.domain)
        throw new Error(`${where}.relatedDomains[${j}]: domain must be a registrable domain`);
      if (!r.source || !HTTP_URL.test(r.source))
        throw new Error(`${where}.relatedDomains[${j}]: source must be an http(s) URL`);
    });
    raw.owns?.forEach((o, j) => {
      if (!o.wikidataId || !/^Q\d+$/.test(o.wikidataId) || !o.name)
        throw new Error(`${where}.owns[${j}]: wikidataId must be a Q-id and name is required`);
      if (!o.source || !HTTP_URL.test(o.source))
        throw new Error(`${where}.owns[${j}]: source must be an http(s) URL`);
    });
    if (raw.primaryDomain === undefined && (raw.relatedDomains?.length || raw.owns?.length)) {
      return raw as RelatedOnlyExtra;
    }
    if (!raw.source || !HTTP_URL.test(raw.source))
      throw new Error(`${where}: source must be an http(s) URL`);
    if (!raw.primaryDomain || !raw.officialDomains?.includes(raw.primaryDomain))
      throw new Error(`${where}: primaryDomain must be listed in officialDomains`);
    return raw as OrgExtra;
  });
}

/**
 * Adds extras to the generated list. An extra replaces a generated org for the same entity or
 * primary domain (its name, slug and primary win; official domains are unioned). Related-only
 * entries do not create orgs; their domains are read by `curatedDomains`.
 */
export function mergeExtras(
  generated: readonly Org[],
  extras: readonly Extra[],
  tranco: ReadonlyMap<string, number>,
  confirmedAt: string,
): Org[] {
  let orgs = generated.map((o) => ({ ...o, slug: '' }));
  const curated: Org[] = [];
  for (const extra of extras.filter(isOrgExtra)) {
    const replaced = orgs.filter(
      (o) => o.wikidataId === extra.wikidataId || o.primaryDomain === extra.primaryDomain,
    );
    orgs = orgs.filter((o) => !replaced.includes(o));
    const match = replaced.find((o) => o.wikidataId === extra.wikidataId);
    curated.push({
      slug: extra.slug ?? '',
      name: extra.name,
      wikidataId: extra.wikidataId,
      country: extra.country ?? match?.country ?? null,
      primaryDomain: extra.primaryDomain,
      officialDomains: [
        ...new Set([...extra.officialDomains, ...(match?.officialDomains ?? [])]),
      ].sort(),
      relatedDomains: [],
      wikidataDomain: match?.wikidataDomain ?? null,
      trancoRank: tranco.get(extra.primaryDomain) ?? null,
      confirmedAt,
    });
  }
  return assignSlugs([...orgs, ...curated].sort(compareOrgs));
}

/** Every curated related domain in extras.json, in file order. */
export function curatedDomains(extras: readonly Extra[]): CuratedDomain[] {
  return extras.flatMap((extra) =>
    (extra.relatedDomains ?? []).map((r) => ({
      wikidataId: extra.wikidataId,
      domain: r.domain,
      url: r.source,
    })),
  );
}

/** Every curated ownership link in extras.json, as ownership-graph edges. */
export function curatedOwnership(extras: readonly Extra[]): OwnedEntity[] {
  return extras.flatMap((extra) =>
    (extra.owns ?? []).map((o) => ({
      parentId: extra.wikidataId,
      wikidataId: o.wikidataId,
      name: o.name,
      websites: [],
      source: o.source,
    })),
  );
}
