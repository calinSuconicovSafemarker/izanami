import { homoglyphSegments, registrationAge, similarityPercent } from './analysis';

describe('similarityPercent', () => {
  it('is 100 for identical labels', () => {
    expect(similarityPercent('tudelft', 'tudelft')).toBe(100);
  });

  it('scales edit distance by the longer label, rounded', () => {
    // tuddelft vs tudelft: distance 1 over 8 code points → 87.5 → 88
    expect(similarityPercent('tuddelft', 'tudelft')).toBe(88);
    // tudelft-login vs tudelft: distance 6 over 13 → 53.8 → 54
    expect(similarityPercent('tudelft-login', 'tudelft')).toBe(54);
  });

  it('counts a homoglyph swap as one edit', () => {
    expect(similarityPercent('tudеlft', 'tudelft')).toBe(86);
  });

  it('is 0 for completely different labels', () => {
    expect(similarityPercent('abc', 'xyz')).toBe(0);
  });
});

describe('homoglyphSegments', () => {
  it('marks the swapped Cyrillic letter and what it imitates', () => {
    expect(homoglyphSegments('tudеlft', 'tudelft')).toEqual([
      { text: 'tud', swapped: false },
      { text: 'е', swapped: true, looksLike: 'e', codePoints: 'U+0435' },
      { text: 'lft', swapped: false },
    ]);
  });

  it('marks several swaps separately', () => {
    const swaps = homoglyphSegments('раypal', 'paypal').filter((s) => s.swapped);
    expect(swaps).toEqual([
      { text: 'р', swapped: true, looksLike: 'p', codePoints: 'U+0440' },
      { text: 'а', swapped: true, looksLike: 'a', codePoints: 'U+0430' },
    ]);
  });

  it('marks a multi-letter swap (rn for m)', () => {
    expect(homoglyphSegments('arnazon', 'amazon')).toEqual([
      { text: 'a', swapped: false },
      { text: 'rn', swapped: true, looksLike: 'm', codePoints: 'U+0072 U+006E' },
      { text: 'azon', swapped: false },
    ]);
  });

  it('returns the label as one plain segment when nothing was swapped', () => {
    expect(homoglyphSegments('tudelft', 'tudelft')).toEqual([{ text: 'tudelft', swapped: false }]);
  });
});

describe('registrationAge', () => {
  const now = '2026-11-19T12:00:00Z';
  it.each([
    ['2001-07-01T00:00:00Z', '2001-07-01 · 25 years'],
    ['2025-11-19T00:00:00Z', '2025-11-19 · 1 year'],
    ['2026-05-01T00:00:00Z', '2026-05-01 · 6 months'],
    ['2026-10-18T00:00:00Z', '2026-10-18 · 1 month'],
    ['2026-11-07T08:00:00Z', '2026-11-07 · 12 days'],
    ['2026-11-19T01:00:00Z', '2026-11-19 · today'],
  ])('%s → %s', (date, expected) => {
    expect(registrationAge(date, now)).toBe(expected);
  });
});
