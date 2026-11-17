import { describe, expect, it } from 'vitest';
import { officialDomainOf, rootUrlsFor } from './domains';

describe('officialDomainOf', () => {
  it.each([
    ['https://www.tudelft.nl/', 'tudelft.nl'],
    ['https://www.tudelft.nl/en/', 'tudelft.nl'],
    ['http://www.tudelft.nl', 'tudelft.nl'],
    ['https://example.co.uk/en-gb', 'example.co.uk'],
    ['https://about.google/', 'about.google'],
    ['https://www.example.com/index.html', 'example.com'],
  ])('%s -> %s', (url, expected) => {
    expect(officialDomainOf(url)).toBe(expected);
  });

  it.each([
    // A page on someone else's platform does not make that platform official.
    ['https://github.com/someproject'],
    ['https://www.facebook.com/someorg/'],
    ['https://example.com/about/company'],
    // A product site on a subdomain does not make its owner's main domain the product's own.
    ['https://mail.google.com/'],
    ['http://feedburner.google.com/'],
    ['not a url'],
    ['ftp://example.com/'],
  ])('%s is not an official domain', (url) => {
    expect(officialDomainOf(url)).toBeNull();
  });
});

describe('rootUrlsFor', () => {
  it('lists the root URL spellings Wikidata commonly stores', () => {
    expect(rootUrlsFor('tudelft.nl')).toEqual([
      'https://tudelft.nl/',
      'https://tudelft.nl',
      'https://www.tudelft.nl/',
      'https://www.tudelft.nl',
      'http://tudelft.nl/',
      'http://tudelft.nl',
      'http://www.tudelft.nl/',
      'http://www.tudelft.nl',
    ]);
  });
});
