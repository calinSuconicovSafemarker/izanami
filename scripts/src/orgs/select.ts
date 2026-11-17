import { officialDomainOf } from './domains';
import type { Psl } from './psl';
import type { WikidataEntity } from './wikidata';

/** One entry of `web/src/data/orgs.json`. */
export interface Org {
  slug: string;
  name: string;
  wikidataId: string;
  /** ISO 3166-1 alpha-2, or null when Wikidata has no P17. */
  country: string | null;
  primaryDomain: string;
  /** Known official domains, sorted; always contains `primaryDomain`. */
  officialDomains: string[];
  /** The Wikidata P856 domain confirmed by Tranco (null for extras not checked against Wikidata). */
  wikidataDomain: string | null;
  /** Tranco rank of `primaryDomain`, or null when unranked (extras only). */
  trancoRank: number | null;
  /** Build date (YYYY-MM-DD) when both sources were last checked. */
  confirmedAt: string;
}

export interface SelectInput {
  entities: ReadonlyMap<string, WikidataEntity>;
  tranco: ReadonlyMap<string, number>;
  psl: Psl;
  limit: number;
  confirmedAt: string;
}

/**
 * ADR-0002: keep entities whose P856 registrable domain has a Tranco rank, one per primary
 * domain, top `limit` by rank, with stable slugs.
 */
export function selectOrgs({ entities, tranco, psl, limit, confirmedAt }: SelectInput): Org[] {
  const byPrimary = new Map<string, { org: Org; sitelinks: number }>();
  for (const entity of entities.values()) {
    const domains = [...new Set(entity.websites.map((w) => officialDomainOf(psl, w)))]
      .filter((d): d is string => d !== null)
      .sort();
    const ranked = domains
      .filter((d) => tranco.has(d))
      .sort((a, b) => (tranco.get(a) ?? 0) - (tranco.get(b) ?? 0));
    const primary = ranked[0];
    if (!primary) continue;
    const org: Org = {
      slug: '',
      name: entity.name,
      wikidataId: entity.wikidataId,
      country: entity.countries[0] ?? null,
      primaryDomain: primary,
      officialDomains: domains,
      wikidataDomain: primary,
      trancoRank: tranco.get(primary) ?? null,
      confirmedAt,
    };
    const current = byPrimary.get(primary);
    if (!current || isPreferred(entity.sitelinks, org, current.sitelinks, current.org)) {
      byPrimary.set(primary, { org, sitelinks: entity.sitelinks });
    }
  }
  const orgs = [...byPrimary.values()]
    .map((v) => v.org)
    .sort(compareOrgs)
    .slice(0, limit);
  return assignSlugs(orgs);
}

function isPreferred(sitelinks: number, org: Org, otherSitelinks: number, other: Org): boolean {
  if (sitelinks !== otherSitelinks) return sitelinks > otherSitelinks;
  return qNumber(org.wikidataId) < qNumber(other.wikidataId);
}

function qNumber(id: string): number {
  return Number(id.slice(1));
}

/** Best Tranco rank first (unranked last), then by Q-number for determinism. */
export function compareOrgs(a: Org, b: Org): number {
  const ra = a.trancoRank ?? Number.POSITIVE_INFINITY;
  const rb = b.trancoRank ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return qNumber(a.wikidataId) - qNumber(b.wikidataId);
}

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fills empty slugs from the name. Orgs are processed in list order (best rank first) and
 * pre-set slugs are reserved first, so a colliding later org gets `-<qid>` appended.
 */
export function assignSlugs(orgs: Org[]): Org[] {
  const taken = new Set(orgs.map((o) => o.slug).filter(Boolean));
  return orgs.map((org) => {
    if (org.slug) return org;
    const base = slugify(org.name) || org.wikidataId.toLowerCase();
    const slug = taken.has(base) ? `${base}-${org.wikidataId.toLowerCase()}` : base;
    taken.add(slug);
    return { ...org, slug };
  });
}
