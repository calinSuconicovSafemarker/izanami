import { decodeDomainSet, encodeDomainSet } from './domain-set';

describe('domain set codec', () => {
  it('round-trips membership for encoded domains', () => {
    const set = decodeDomainSet(encodeDomainSet(['google.com', 'tudelft.nl', 'example.org']));
    expect(set.has('google.com')).toBe(true);
    expect(set.has('tudelft.nl')).toBe(true);
    expect(set.has('example.org')).toBe(true);
    expect(set.has('tudelft-nonexistent-zzzq.com')).toBe(false);
  });

  it('ignores case and a trailing dot', () => {
    const set = decodeDomainSet(encodeDomainSet(['Google.com']));
    expect(set.has('GOOGLE.COM.')).toBe(true);
  });

  it('handles an empty set and duplicate inputs', () => {
    expect(decodeDomainSet(encodeDomainSet([])).has('a.com')).toBe(false);
    const set = decodeDomainSet(encodeDomainSet(['a.com', 'a.com', 'b.com']));
    expect(set.size).toBe(2);
    expect(set.has('b.com')).toBe(true);
  });

  it('stays exact for many domains', () => {
    const domains = Array.from({ length: 5000 }, (_, i) => `site${i}.com`);
    const set = decodeDomainSet(encodeDomainSet(domains));
    expect(domains.every((d) => set.has(d))).toBe(true);
    const misses = Array.from({ length: 5000 }, (_, i) => `other${i}.net`);
    expect(misses.filter((d) => set.has(d)).length).toBeLessThan(3);
  });
});
