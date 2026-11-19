import { describe, expect, it } from 'vitest';
import { generatePermutations } from './permutations';

const google = {
  brandLabel: 'google',
  primaryTld: 'com',
  tlds: ['nl', 'com', 'net', 'org', 'info', 'xyz', 'top'],
  officialDomains: ['google.com', 'google.nl', 'google-analytics.com'],
};

describe('generatePermutations', () => {
  it('is deterministic', () => {
    expect(generatePermutations(google)).toEqual(generatePermutations(google));
  });

  it('stays within the default bound of 150 and honours a smaller limit', () => {
    expect(generatePermutations(google).length).toBeLessThanOrEqual(150);
    expect(generatePermutations({ ...google, limit: 20 })).toHaveLength(20);
  });

  it('never repeats a domain', () => {
    const domains = generatePermutations(google).map((c) => c.domain);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it('excludes the official domains', () => {
    const domains = generatePermutations(google).map((c) => c.domain);
    for (const official of google.officialDomains) expect(domains).not.toContain(official);
  });

  it('swaps the brand across the given TLDs', () => {
    const swaps = generatePermutations(google).filter((c) => c.technique === 'tld-swap');
    expect(swaps.map((c) => c.domain)).toEqual([
      'google.net',
      'google.org',
      'google.info',
      'google.xyz',
      'google.top',
    ]);
  });

  it('produces one example of each typo technique on the primary TLD', () => {
    const byDomain = new Map(generatePermutations(google).map((c) => [c.domain, c.technique]));
    expect(byDomain.get('gogle.com')).toBe('omission');
    expect(byDomain.get('gooogle.com')).toBe('repetition');
    expect(byDomain.get('ogogle.com')).toBe('transposition');
    expect(byDomain.get('foogle.com')).toBe('replacement');
    expect(byDomain.get('g0ogle.com')).toBe('homoglyph');
    expect(byDomain.get('goo-gle.com')).toBe('hyphenation');
    expect(byDomain.get('google-login.com')).toBe('combo');
  });

  it('keeps every technique represented when the limit is tight', () => {
    const techniques = new Set(
      generatePermutations({ ...google, limit: 16 }).map((c) => c.technique),
    );
    expect([...techniques].sort()).toEqual([
      'combo',
      'homoglyph',
      'hyphenation',
      'omission',
      'repetition',
      'replacement',
      'tld-swap',
      'transposition',
    ]);
  });

  it('gives Unicode homoglyphs a punycode domain and a Unicode display form', () => {
    const idn = generatePermutations(google).find((c) => c.display === 'gоogle.com');
    expect(idn).toMatchObject({ domain: 'xn--gogle-jye.com', technique: 'homoglyph', tld: 'com' });
  });

  it('only emits valid hostnames (no leading or trailing hyphen, no empty label)', () => {
    for (const c of generatePermutations({ ...google, brandLabel: 'ab' })) {
      expect(c.domain).toMatch(/^(?!-)[a-z0-9-]+(?<!-)\.[a-z]+$/);
    }
  });
});
