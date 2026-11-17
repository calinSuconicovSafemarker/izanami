import { describe, expect, it } from 'vitest';
import { parseTranco, TRANCO_URL, trancoCsv, trancoTopDomains } from './tranco';
import { zipOf } from './zip-fixture';

const CSV = '1,google.com\r\n2,www.google.com\r\n3,co.uk\r\n4,bbc.co.uk\r\n5,Facebook.com\r\n';
const ZIP = zipOf('top-1m.csv', CSV);

describe('trancoCsv', () => {
  it('downloads the Tranco zip and extracts the CSV', async () => {
    const urls: string[] = [];
    const csv = await trancoCsv(async (url) => (urls.push(url), ZIP));
    expect(urls).toEqual([TRANCO_URL]);
    expect(csv).toBe(CSV);
  });
});

describe('trancoTopDomains', () => {
  it('returns the first N listed hostnames, lowercased, in rank order', () => {
    expect(trancoTopDomains(CSV, 2)).toEqual(['google.com', 'www.google.com']);
    expect(trancoTopDomains(CSV, 10)).toHaveLength(5);
    expect(trancoTopDomains(CSV, 10)[4]).toBe('facebook.com');
  });
});

describe('parseTranco', () => {
  it('maps registrable domains to their best rank, skipping suffixes', () => {
    expect(parseTranco(CSV, 100)).toEqual(
      new Map([
        ['google.com', 1],
        ['bbc.co.uk', 4],
        ['facebook.com', 5],
      ]),
    );
  });

  it('stops after the requested number of registrable domains', () => {
    expect([...parseTranco(CSV, 2).keys()]).toEqual(['google.com', 'bbc.co.uk']);
  });
});
