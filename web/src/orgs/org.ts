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
  /**
   * Top-level domains the organisation runs for itself (punycode, no dot, sorted), e.g.
   * `['gle', 'google']`: every domain under them is the organisation's (ticket 14).
   */
  brandTlds: readonly string[];
  /** The Wikidata P856 domain confirmed by the popularity data; null for curated extras. */
  wikidataDomain: string | null;
  /** Popularity of `primaryDomain`, or null when not listed (extras only). */
  popularity: Popularity | null;
  /** Build date (YYYY-MM-DD) when both sources were last checked. */
  confirmedAt: string;
}

/** Popularity lists (ticket 19): the Chrome UX Report and the Majestic Million. */
export type PopularitySource = 'crux' | 'majestic';

/** "Among the top N registrable domains" of at least one popularity list. */
export type PopularityBucket = 1_000 | 10_000 | 100_000 | 1_000_000;

/** A domain's combined popularity across the lists (ticket 19, ADR-0002 Amendment 5). */
export interface Popularity {
  /** Best bucket across the lists. */
  bucket: PopularityBucket;
  /** Lists that name the domain within the top 1M, sorted. */
  sources: readonly PopularitySource[];
  /** Exact Majestic Million rank, or null when Majestic does not list it. */
  majesticRank: number | null;
  /** Chrome UX Report bucket, or null when CrUX does not list it. */
  cruxBucket: PopularityBucket | null;
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
