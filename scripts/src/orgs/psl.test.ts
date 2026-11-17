import { describe, expect, it } from 'vitest';
import { parsePsl, registrableDomain } from './psl';

const PSL_FIXTURE = `
// comment line
com
uk
co.uk
nl
jp
*.kawasaki.jp
!city.kawasaki.jp
// ===BEGIN PRIVATE DOMAINS===
github.io
ελ
`;

describe('registrableDomain', () => {
  const psl = parsePsl(PSL_FIXTURE);

  it.each([
    ['www.tudelft.nl', 'tudelft.nl'],
    ['tudelft.nl', 'tudelft.nl'],
    ['login.tudelft.nl.evil.co.uk', 'evil.co.uk'],
    ['WWW.Example.COM.', 'example.com'],
    ['foo.github.io', 'foo.github.io'],
    ['a.b.foo.kawasaki.jp', 'b.foo.kawasaki.jp'],
    ['www.city.kawasaki.jp', 'city.kawasaki.jp'],
    ['xn--hxargifdar.xn--qxam', 'xn--hxargifdar.xn--qxam'],
  ])('%s -> %s', (host, expected) => {
    expect(registrableDomain(psl, host)).toBe(expected);
  });

  it.each([['co.uk'], ['nl'], ['github.io'], [''], ['localhost'], ['192.168.0.1']])(
    '%s has no registrable domain',
    (host) => {
      expect(registrableDomain(psl, host)).toBeNull();
    },
  );
});
