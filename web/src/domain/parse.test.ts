import { InvalidVariantError, parseVariant } from './parse';

describe('parseVariant', () => {
  it('splits a plain domain into registrable domain, label and TLD', () => {
    expect(parseVariant('tudelft.nl')).toEqual({
      input: 'tudelft.nl',
      unicode: 'tudelft.nl',
      punycode: 'tudelft.nl',
      registrableDomain: 'tudelft.nl',
      label: 'tudelft',
      tld: 'nl',
      subdomains: [],
      isSubdomainTrick: false,
    });
  });
});

describe('parseVariant: subdomains', () => {
  it('normalises to the registrable domain and flags a domain hidden in the subdomain', () => {
    const v = parseVariant('tudelft.nl.evil.com');
    expect(v.registrableDomain).toBe('evil.com');
    expect(v.label).toBe('evil');
    expect(v.subdomains).toEqual(['tudelft', 'nl']);
    expect(v.isSubdomainTrick).toBe(true);
  });

  it('uses the full public suffix (login.tudelft.nl.evil.co.uk → evil.co.uk)', () => {
    const v = parseVariant('login.tudelft.nl.evil.co.uk');
    expect(v.registrableDomain).toBe('evil.co.uk');
    expect(v.tld).toBe('co.uk');
    expect(v.isSubdomainTrick).toBe(true);
  });

  it('does not flag an ordinary subdomain', () => {
    const v = parseVariant('www.tudelft.nl');
    expect(v.registrableDomain).toBe('tudelft.nl');
    expect(v.isSubdomainTrick).toBe(false);
  });

  it('accepts a pasted URL', () => {
    expect(parseVariant(' https://TUDelft.nl/login?x=1 ').registrableDomain).toBe('tudelft.nl');
  });
});

describe('parseVariant: IDN', () => {
  // tudеlft with Cyrillic е (U+0435)
  const spoof = 'tud\u0435lft.nl';
  const spoofAscii = 'xn--tudlft-5of.nl'; // per WHATWG URL domainToASCII

  it('shows a Unicode variant in punycode', () => {
    const v = parseVariant(spoof);
    expect(v.punycode).toBe(spoofAscii);
    expect(v.registrableDomain).toBe(spoofAscii);
    expect(v.label).toBe('tud\u0435lft');
  });

  it('round-trips xn-- input to Unicode and back', () => {
    const v = parseVariant(spoofAscii);
    expect(v.unicode).toBe(spoof);
    expect(parseVariant(v.unicode).punycode).toBe(spoofAscii);
  });
});

describe('parseVariant: invalid input', () => {
  it.each([
    ['', /empty/],
    ['tudelft', /public suffix/],
    ['tudelft..nl', /empty label/],
    ['tu delft.nl', /spaces/],
    ['tu_delft.nl', /invalid characters/],
    ['-tudelft.nl', /invalid characters/],
    ['192.168.0.1', /IP address/],
    ['xn--zz.nl', /punycode/],
  ])('rejects %j', (input, reason) => {
    expect(() => parseVariant(input)).toThrow(InvalidVariantError);
    expect(() => parseVariant(input)).toThrow(reason);
  });
});
