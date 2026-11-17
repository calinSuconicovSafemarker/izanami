import { officialDomainOf } from './domains';
import type { Org } from '../lib/web';
import type { WikidataEntity } from './wikidata';

export type { Org };

export interface SelectInput {
  entities: ReadonlyMap<string, WikidataEntity>;
  tranco: ReadonlyMap<string, number>;
  limit: number;
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
 * ADR-0002: keep entities whose P856 registrable domain has a Tranco rank, top `limit` by rank,
 * with stable slugs. Entities are taken in order of preference; each claims all its official
 * domains, and an entity whose ranked domains are all claimed already is skipped, so a domain
 * belongs to one organisation only.
 */
export function selectOrgs({ entities, tranco, limit, confirmedAt }: SelectInput): Org[] {
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
      .filter((d) => tranco.has(d))
      .sort((a, b) => (tranco.get(a) ?? 0) - (tranco.get(b) ?? 0))[0];
    if (!primary) continue;
    domains.forEach((d) => claimed.add(d));
    orgs.push({
      slug: '',
      name: entity.name,
      wikidataId: entity.wikidataId,
      country: entity.countries[0] ?? null,
      primaryDomain: primary,
      officialDomains: domains,
      wikidataDomain: primary,
      trancoRank: tranco.get(primary) ?? null,
      confirmedAt,
    });
  }
  return assignSlugs(orgs.sort(compareOrgs).slice(0, limit));
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
