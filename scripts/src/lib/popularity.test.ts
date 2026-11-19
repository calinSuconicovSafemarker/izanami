import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  bucketOf,
  combinePopularity,
  CRUX_URL,
  loadPopularity,
  MAJESTIC_URL,
  parseCrux,
  parseMajestic,
  rankedDomains,
} from './popularity';

const MAJESTIC =
  'GlobalRank,TldRank,Domain,TLD,RefSubNets,RefIPs\r\n' +
  '1,1,google.com,com,9,9\r\n' +
  '2,2,plus.google.com,com,9,9\r\n' +
  '3,1,co.uk,uk,9,9\r\n' +
  '4,1,bbc.co.uk,uk,9,9\r\n' +
  '20000,3,Example.ORG,org,9,9\r\n';

const CRUX =
  'origin,rank\n' +
  'https://www.google.com,1000\n' +
  'https://mail.google.com,1000\n' +
  'http://only-crux.nl,5000\n' +
  'https://example.org,1000\n' +
  'https://tail.de,1000000\n' +
  'not a url,1000\n';

describe('bucketOf', () => {
  it('maps a rank to the smallest bucket that contains it', () => {
    expect(bucketOf(1)).toBe(1_000);
    expect(bucketOf(1_000)).toBe(1_000);
    expect(bucketOf(1_001)).toBe(10_000);
    expect(bucketOf(5_000)).toBe(10_000);
    expect(bucketOf(500_000)).toBe(1_000_000);
    expect(bucketOf(1_000_001)).toBeNull();
  });
});

describe('parseMajestic', () => {
  it('maps registrable domains to their best rank, skipping the header and suffixes', () => {
    expect(parseMajestic(MAJESTIC)).toEqual(
      new Map([
        ['google.com', 1],
        ['bbc.co.uk', 4],
        ['example.org', 20_000],
      ]),
    );
  });
});

describe('parseCrux', () => {
  it('maps origins to registrable domains with their best bucket (5k counts as top 10k)', () => {
    expect(parseCrux(CRUX)).toEqual(
      new Map([
        ['google.com', 1_000],
        ['only-crux.nl', 10_000],
        ['example.org', 1_000],
        ['tail.de', 1_000_000],
      ]),
    );
  });
});

describe('combinePopularity', () => {
  const combined = combinePopularity(parseMajestic(MAJESTIC), parseCrux(CRUX));

  it('takes the best bucket across lists and records which lists name the domain', () => {
    expect(combined.get('google.com')).toEqual({
      bucket: 1_000,
      sources: ['crux', 'majestic'],
      majesticRank: 1,
      cruxBucket: 1_000,
    });
    expect(combined.get('example.org')).toEqual({
      bucket: 1_000,
      sources: ['crux', 'majestic'],
      majesticRank: 20_000,
      cruxBucket: 1_000,
    });
    expect(combined.get('only-crux.nl')).toEqual({
      bucket: 10_000,
      sources: ['crux'],
      majesticRank: null,
      cruxBucket: 10_000,
    });
    expect(combined.get('bbc.co.uk')).toEqual({
      bucket: 1_000,
      sources: ['majestic'],
      majesticRank: 4,
      cruxBucket: null,
    });
  });

  it('orders by best position in either list (CrUX bucket counts as half its bound)', () => {
    // example.org: Majestic 20,000 but CrUX top 1k (≈ 500); only-crux.nl: CrUX top 10k (≈ 5,000).
    expect(rankedDomains(combined)).toEqual([
      'google.com',
      'bbc.co.uk',
      'example.org',
      'only-crux.nl',
      'tail.de',
    ]);
  });
});

describe('loadPopularity', () => {
  it('downloads both lists and gunzips the CrUX file', async () => {
    const urls: string[] = [];
    const files: Record<string, Uint8Array> = {
      [MAJESTIC_URL]: Buffer.from(MAJESTIC),
      [CRUX_URL]: gzipSync(CRUX),
    };
    const popularity = await loadPopularity(async (url) => {
      urls.push(url);
      return files[url]!;
    });
    expect(urls.sort()).toEqual([MAJESTIC_URL, CRUX_URL].sort());
    expect(popularity.size).toBe(5);
  });
});
