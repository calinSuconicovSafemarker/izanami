import { officialDomainOf } from './domains';
import { comparePopularity, type PopularityMap } from '../lib/popularity';
import type { Org } from '../lib/web';
import type { WikidataEntity } from './wikidata';

export type { Org };

export interface SelectInput {
  entities: ReadonlyMap<string, WikidataEntity>;
  /** Candidate domains (the top 10k bucket) and their popularity. */
  popularity: PopularityMap;
  limit: number;
  /** Q-ids kept even beyond `limit` (`scripts/data/pinned-orgs.json`), when they qualify. */
  pinned?: ReadonlySet<string>;
  confirmedAt: string;
}

/**
 * Organisations with at least this many sitelinks get the organisation bonus; obscure ones that
 * merely list a platform as their website (a sports club with `instagram.com`) do not.
 */
export const NOTABLE_ORG_SITELINKS = 10;

/**
 * How strongly an entity claims its domains: sitelinks, doubled for notable organisations and
 * halved for software/products. Google beats "Google Search" with somewhat more sitelinks, X beats
 * "Snowflake ID", but the 1999 bank "X.com" does not beat X, which has eight times as many.
 */
function preference(e: WikidataEntity): number {
  const notableOrg = e.isOrganisation && e.sitelinks >= NOTABLE_ORG_SITELINKS;
  return e.sitelinks * (notableOrg ? 2 : 1) * (e.isProduct ? 0.5 : 1);
}

/**
 * ADR-0002: keep entities whose P856 registrable domain is in the popularity data, top `limit` by
 * popularity (best position in either list), plus pinned entities beyond the limit, with stable
 * slugs. Entities are taken in order of preference; each claims all its official
 * domains, and an entity whose ranked domains are all claimed already is skipped, so a domain
 * belongs to one organisation only.
 */
export function selectOrgs({
  entities,
  popularity,
  limit,
  pinned = new Set(),
  confirmedAt,
}: SelectInput): Org[] {
  const ordered = [...entities.values()].sort(
    (a, b) => preference(b) - preference(a) || qNumber(a.wikidataId) - qNumber(b.wikidataId),
  );
  const claimed = new Set<string>();
  const orgs: Org[] = [];
  for (const entity of ordered) {
    const domains = [...new Set(entity.websites.map(officialDomainOf))]
      .filter((d): d is string => d !== null && !claimed.has(d))
      .sort();
    const primary = domains
      .filter((d) => popularity.has(d))
      .sort((a, b) => comparePopularity(popularity.get(a), popularity.get(b)))[0];
    if (!primary) continue;
    domains.forEach((d) => claimed.add(d));
    orgs.push({
      slug: '',
      name: entity.name,
      wikidataId: entity.wikidataId,
      country: entity.countries[0] ?? null,
      primaryDomain: primary,
      officialDomains: domains,
      relatedDomains: [],
      brandTlds: [],
      wikidataDomain: primary,
      popularity: popularity.get(primary) ?? null,
      confirmedAt,
    });
  }
  const kept = orgs.sort(compareOrgs).filter((o, i) => i < limit || pinned.has(o.wikidataId));
  return assignSlugs(kept);
}

/**
 * A notable organisation kept even when it falls below the cap (ticket 19): the popularity lists
 * rank some commonly phished brands just under the cut. It still has to qualify (P856 domain in
 * the candidate bucket).
 */
export interface PinnedOrg {
  wikidataId: string;
  name: string;
  /** Why it is pinned, for the human reader. */
  reason: string;
}

/** Validates the parsed `pinned-orgs.json` content. */
export function parsePinnedOrgs(json: unknown): PinnedOrg[] {
  if (!Array.isArray(json)) throw new Error('pinned-orgs.json must be an array');
  return json.map((raw: Partial<PinnedOrg>, i) => {
    if (!raw.wikidataId || !/^Q\d+$/.test(raw.wikidataId) || !raw.name || !raw.reason)
      throw new Error(`pinned-orgs.json[${i}]: wikidataId (Q-id), name and reason are required`);
    return { wikidataId: raw.wikidataId, name: raw.name, reason: raw.reason };
  });
}

function qNumber(id: string): number {
  return Number(id.slice(1));
}

/** Most popular first (not listed last), then by Q-number for determinism. */
export function compareOrgs(a: Org, b: Org): number {
  return (
    comparePopularity(a.popularity, b.popularity) || qNumber(a.wikidataId) - qNumber(b.wikidataId)
  );
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
 * Fills empty slugs from the name. Orgs are processed in list order (most popular first) and
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
