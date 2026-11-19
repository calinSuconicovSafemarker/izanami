import { bucketOf, type Popularity } from './popularity';

/** Test helper: popularity of a domain listed only by Majestic at `rank`. */
export function majesticOnly(rank: number): Popularity {
  return {
    bucket: bucketOf(rank) ?? 1_000_000,
    sources: ['majestic'],
    majesticRank: rank,
    cruxBucket: null,
  };
}

/** Test helper: a popularity map from Majestic ranks. */
export function ranked(entries: Iterable<readonly [string, number]>): Map<string, Popularity> {
  return new Map([...entries].map(([domain, rank]) => [domain, majesticOnly(rank)]));
}
