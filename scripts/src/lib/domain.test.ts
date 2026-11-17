import { describe, expect, it } from 'vitest';
import { registrableDomain } from './domain';

describe('registrableDomain', () => {
  it.each([
    ['www.tudelft.nl', 'tudelft.nl'],
    ['shop.example.co.uk', 'example.co.uk'],
    ['WWW.Example.COM.', 'example.com'],
    ['münchen.de', 'xn--mnchen-3ya.de'],
  ])('%s -> %s', (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });

  it.each([['co.uk'], ['192.168.0.1'], ['']])('%s has no registrable domain', (host) => {
    expect(registrableDomain(host)).toBeNull();
  });
});
