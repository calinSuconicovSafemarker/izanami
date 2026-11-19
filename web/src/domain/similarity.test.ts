import { parseVariant } from './parse';
import { similarity, type LookalikeKind } from './similarity';

const brand = 'tudelft';
const official = ['tudelft.nl'];
const check = (input: string) => similarity(parseVariant(input), brand, official);

describe('similarity: acceptance table', () => {
  it.each<[string, LookalikeKind]>([
    ['tudelft.nl', 'official'],
    ['tudelft.md', 'tld-swap'],
    ['tuddelft.nl', 'typo'],
    ['tud\u0435lft.nl', 'homoglyph'], // Cyrillic е
    ['tudelft-login.com', 'combo'],
    ['tudelft.nl.evil.com', 'subdomain-trick'],
    ['example.org', 'unrelated'],
  ])('%s → %s', (input, kind) => {
    expect(check(input).kind).toBe(kind);
  });
});

describe('similarity: signals', () => {
  it('reports the subdomain trick using the registrable domain', () => {
    expect(check('tudelft.nl.evil.com')).toMatchObject({
      isOfficial: false,
      tldSwap: false,
      kind: 'subdomain-trick',
    });
  });

  it('treats a subdomain of an official domain as official', () => {
    expect(check('www.tudelft.nl')).toMatchObject({ isOfficial: true, kind: 'official' });
  });

  it('flags the brand as a bare subdomain label (tudelft.evil.com)', () => {
    expect(check('tudelft.evil.com').kind).toBe('subdomain-trick');
  });

  it('reports a TLD swap', () => {
    expect(check('tudelft.co.uk')).toMatchObject({
      tldSwap: true,
      editDistance: 0,
      kind: 'tld-swap',
    });
  });

  it('counts an adjacent transposition as one edit', () => {
    expect(check('tuedlft.nl')).toMatchObject({ editDistance: 1, kind: 'typo' });
  });

  it('stops calling it a typo beyond two edits', () => {
    expect(check('tdlfx.nl')).toMatchObject({ editDistance: 3, kind: 'unrelated' });
  });

  it('reports a homoglyph with a non-zero raw edit distance', () => {
    expect(check('tud\u0435lft.com')).toMatchObject({
      homoglyph: true,
      editDistance: 1,
      kind: 'homoglyph',
    });
  });

  it('reports a homoglyph combo-squat as combo', () => {
    expect(check('tud\u0435lft-secure.com')).toMatchObject({ containsBrand: true, kind: 'combo' });
  });

  it('allows only one edit for short brands', () => {
    expect(similarity(parseVariant('abc.com'), 'ing', ['ing.nl']).kind).toBe('unrelated');
    expect(similarity(parseVariant('inq.com'), 'ing', ['ing.nl']).kind).toBe('typo');
  });

  it('accepts official domains in Unicode or punycode form', () => {
    const v = parseVariant('xn--mnchen-3ya.de');
    expect(similarity(v, 'münchen', ['münchen.de']).kind).toBe('official');
    expect(similarity(parseVariant('münchen.at'), 'münchen', ['xn--mnchen-3ya.de']).kind).toBe(
      'tld-swap',
    );
  });

  it('matches a Unicode brand label for a TLD swap', () => {
    expect(similarity(parseVariant('münchen.at'), 'münchen', ['muenchen.de']).kind).toBe(
      'tld-swap',
    );
  });

  it('treats a swap of another official label as a TLD swap', () => {
    expect(
      similarity(parseVariant('tu-delft.com'), 'tudelft', ['tudelft.nl', 'tu-delft.nl']).tldSwap,
    ).toBe(true);
  });
});

describe('similarity: brand TLDs (ticket 14)', () => {
  const google = (input: string, brandTlds?: readonly string[]) =>
    similarity(parseVariant(input), 'google', ['google.com'], brandTlds);

  it('treats any domain under a TLD the org operates as official', () => {
    expect(google('c.gle', ['gle', 'google'])).toMatchObject({
      isOfficial: true,
      kind: 'official',
      brandTld: 'gle',
    });
    expect(google('about.google', ['gle', 'google'])).toMatchObject({
      isOfficial: true,
      brandTld: 'google',
    });
  });

  it('does not without the brand TLD', () => {
    expect(google('c.gle')).toMatchObject({ isOfficial: false });
    expect(google('c.gle').brandTld).toBeUndefined();
    expect(google('google.com', ['gle']).brandTld).toBeUndefined();
  });
});
