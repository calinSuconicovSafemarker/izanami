/**
 * One entry of `web/src/data/orgs.json` (ticket 01, ADR-0002). The single definition of the
 * schema: the build-data generator (`scripts/`) produces this type and the web app loads it
 * without a cast, so schema drift fails type-check on both sides.
 */
export interface Org {
  slug: string;
  name: string;
  wikidataId: string;
  /** ISO 3166-1 alpha-2, or null when Wikidata has none. */
  country: string | null;
  primaryDomain: string;
  /** Known official domains, sorted; always contains `primaryDomain`. */
  officialDomains: readonly string[];
  /**
   * Other domains the organisation's staff and systems use (products, subsidiaries, vendor
   * lists), sorted by domain; none is in `officialDomains` (ticket 15, ADR-0002 Amendment 2).
   */
  relatedDomains: readonly RelatedDomain[];
  /** The Wikidata P856 domain confirmed by Tranco; null for curated extras. */
  wikidataDomain: string | null;
  /** Tranco rank of `primaryDomain`, or null when unranked (extras only). */
  trancoRank: number | null;
  /** Build date (YYYY-MM-DD) when both sources were last checked. */
  confirmedAt: string;
}

/**
 * Where a related domain comes from: the Wikidata ownership graph (P127/P749/P355), a list the
 * company publishes itself, or a hand-curated entry in `scripts/data/extras.json`.
 */
export type RelatedSource = 'wikidata-owned' | 'published-list' | 'curated';

export interface RelatedDomain {
  /** Registrable domain (punycode). */
  domain: string;
  source: RelatedSource;
  /** Human-readable origin: the owned entity ("YouTube") or the published list's name. */
  via?: string;
  /** Evidence link: the Wikidata item, the published list, or the curated source. */
  url?: string;
}
