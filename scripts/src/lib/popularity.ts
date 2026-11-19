import { gunzipSync } from 'node:zlib';
import type { Popularity, PopularityBucket, PopularitySource } from './web';
import { registrableDomain } from './domain';
import { cachedDownload } from './net';

export type { Popularity, PopularityBucket, PopularitySource };

/**
 * Popularity data (ticket 19): two lists whose licences allow commercial use with attribution,
 * combined into one signal per registrable domain. See `docs/research/licences.md`.
 */

/** Majestic Million (CC BY 3.0): daily top 1M domains by referring subnets, exact rank. */
export const MAJESTIC_URL = 'https://downloads.majestic.com/majestic_million.csv';

/**
 * The Chrome UX Report month to use (YYYYMM). Bump it when refreshing the data; the file is cached
 * under its month, so a rebuild with the same month never downloads again.
 */
export const CRUX_MONTH = '202610';

/**
 * Chrome UX Report top origins (CC BY 4.0, Google), rank buckets by real Chrome traffic. Google
 * publishes CrUX only in BigQuery; this is the monthly global list exported unmodified from that
 * public dataset by the `zakird/crux-top-lists` repository (columns `origin,rank`).
 */
export const CRUX_URL = `https://raw.githubusercontent.com/zakird/crux-top-lists/main/data/global/${CRUX_MONTH}.csv.gz`;

/** Bucket upper bounds, best first: "in the top 1k / 10k / 100k / 1M". */
export const POPULARITY_BUCKETS: readonly PopularityBucket[] = [1_000, 10_000, 100_000, 1_000_000];

/** The smallest bucket that contains `rank`, or null beyond the top 1M. */
export function bucketOf(rank: number): PopularityBucket | null {
  return POPULARITY_BUCKETS.find((b) => rank <= b) ?? null;
}

/** Registrable domain → combined popularity. */
export type PopularityMap = ReadonlyMap<string, Popularity>;

/** Cache file names under `scripts/.cache/popularity/`. */
function cacheName(url: string): string {
  if (url === CRUX_URL) return `popularity/crux-${CRUX_MONTH}.csv.gz`;
  return `popularity/${new URL(url).pathname.split('/').pop()}`;
}

/** Downloads each list once into the shared cache. */
export function downloadPopularityList(url: string): Promise<Buffer> {
  return cachedDownload(url, cacheName(url));
}

/** Majestic CSV (`GlobalRank,TldRank,Domain,…`) → registrable domain → best rank. */
export function parseMajestic(csv: string): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const line of csv.split(/\r?\n/)) {
    const [rankText, , host] = line.split(',');
    const rank = Number(rankText);
    if (!host || !Number.isInteger(rank) || rank < 1) continue;
    const domain = registrableDomain(host);
    if (domain && rank < (ranks.get(domain) ?? Infinity)) ranks.set(domain, rank);
  }
  return ranks;
}

/** CrUX CSV (`origin,rank`, rank = bucket bound) → registrable domain → best bucket. */
export function parseCrux(csv: string): Map<string, PopularityBucket> {
  const buckets = new Map<string, PopularityBucket>();
  for (const line of csv.split(/\r?\n/)) {
    const [origin, rankText] = line.split(',');
    const bucket = bucketOf(Number(rankText));
    if (!origin || !bucket) continue;
    let host: string;
    try {
      host = new URL(origin).hostname;
    } catch {
      continue;
    }
    const domain = registrableDomain(host);
    if (domain && bucket < (buckets.get(domain) ?? Infinity)) buckets.set(domain, bucket);
  }
  return buckets;
}

/**
 * One popularity signal per registrable domain: the best bucket across both lists, which lists
 * name the domain, its Majestic rank and its CrUX bucket.
 */
export function combinePopularity(
  majestic: ReadonlyMap<string, number>,
  crux: ReadonlyMap<string, PopularityBucket>,
): Map<string, Popularity> {
  const combined = new Map<string, Popularity>();
  for (const domain of new Set([...majestic.keys(), ...crux.keys()])) {
    const rank = majestic.get(domain);
    const majesticBucket = rank === undefined ? null : bucketOf(rank);
    const cruxBucket = crux.get(domain) ?? null;
    const sources: PopularitySource[] = [];
    if (cruxBucket) sources.push('crux');
    if (majesticBucket) sources.push('majestic');
    const bucket = Math.min(majesticBucket ?? Infinity, cruxBucket ?? Infinity);
    if (!bucketOf(bucket)) continue;
    combined.set(domain, {
      bucket: bucket as PopularityBucket,
      sources,
      majesticRank: rank ?? null,
      cruxBucket,
    });
  }
  return combined;
}

/**
 * A domain's best position in either list: its Majestic rank, or half its CrUX bucket bound (CrUX
 * shuffles sites within a bucket, so a top-1k site counts as rank 500). Infinity when not listed.
 */
export function popularityPosition(p: Popularity | null | undefined): number {
  if (!p) return Infinity;
  return Math.min(p.majesticRank ?? Infinity, p.cruxBucket ? p.cruxBucket / 2 : Infinity);
}

/** Most popular first: best position in either list, then Majestic rank (unranked last). */
export function comparePopularity(
  a: Popularity | null | undefined,
  b: Popularity | null | undefined,
): number {
  const rank = (p: Popularity | null | undefined) => p?.majesticRank ?? Infinity;
  const pa = popularityPosition(a);
  const pb = popularityPosition(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  if (rank(a) !== rank(b)) return rank(a) < rank(b) ? -1 : 1;
  return 0;
}

/** Domains sorted most popular first (ties by name, for determinism). */
export function rankedDomains(popularity: PopularityMap): string[] {
  return [...popularity.keys()].sort(
    (a, b) =>
      comparePopularity(popularity.get(a), popularity.get(b)) || (a < b ? -1 : a > b ? 1 : 0),
  );
}

/** Downloads (once, cached) and combines both lists. */
export async function loadPopularity(
  fetchBytes: (url: string) => Promise<Uint8Array> = downloadPopularityList,
): Promise<Map<string, Popularity>> {
  const [majesticCsv, cruxGz] = await Promise.all([fetchBytes(MAJESTIC_URL), fetchBytes(CRUX_URL)]);
  return combinePopularity(
    parseMajestic(Buffer.from(majesticCsv).toString('utf8')),
    parseCrux(gunzipSync(cruxGz).toString('utf8')),
  );
}
