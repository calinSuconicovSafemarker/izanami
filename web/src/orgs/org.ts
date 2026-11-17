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
  /** The Wikidata P856 domain confirmed by Tranco; null for curated extras. */
  wikidataDomain: string | null;
  /** Tranco rank of `primaryDomain`, or null when unranked (extras only). */
  trancoRank: number | null;
  /** Build date (YYYY-MM-DD) when both sources were last checked. */
  confirmedAt: string;
}
