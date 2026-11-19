import { describe, expect, it } from 'vitest';
import { rateTld } from './rating';

const google = { officialDomains: ['google.com', 'google.co.uk', 'google.nl'] };

describe('rateTld', () => {
  it("rates the TLDs of the org's official domains as official", () => {
    expect(rateTld('com', google)).toMatchObject({ category: 'official', label: 'official' });
    expect(rateTld('co.uk', google).category).toBe('official');
  });

  it('rates ccTLDs as country, with the country name', () => {
    expect(rateTld('fr')).toMatchObject({ category: 'country', country: 'France' });
    expect(rateTld('uk')).toMatchObject({ category: 'country', country: 'United Kingdom' });
    expect(rateTld('fr').label).toBe('country · France');
  });

  it('rates legacy generic TLDs as generic', () => {
    for (const tld of ['com', 'net', 'org', 'info'])
      expect(rateTld(tld)).toMatchObject({ category: 'generic', label: 'generic' });
  });

  it('rates the abuse-heavy TLDs as high-abuse, even when they are ccTLDs', () => {
    expect(rateTld('xyz')).toMatchObject({ category: 'high-abuse', label: 'high-abuse' });
    expect(rateTld('tk')).toMatchObject({ category: 'high-abuse', country: 'Tokelau' });
  });

  it('rates supplied single-owner TLDs as brand', () => {
    expect(rateTld('google', { brandTlds: ['google'] })).toMatchObject({
      category: 'brand',
      label: 'brand',
    });
  });

  it('prefers official over every other category', () => {
    expect(rateTld('xyz', { officialDomains: ['abc.xyz'] }).category).toBe('official');
  });

  it('falls back to other for unlisted gTLDs', () => {
    expect(rateTld('guide')).toMatchObject({ category: 'other', label: 'other gTLD' });
  });

  it('ignores case and a leading dot', () => {
    expect(rateTld('.XYZ').tld).toBe('xyz');
  });
});
