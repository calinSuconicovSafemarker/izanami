import { describe, expect, it } from 'vitest';
import { parseRdapBootstrap } from './rdap';

const BOOTSTRAP = {
  version: '1.0',
  publication: '2026-11-01T00:00:00Z',
  services: [
    [['nl'], ['https://rdap.sidn.nl/']],
    [
      ['com', 'net'],
      ['http://rdap.verisign.example/', 'https://rdap.verisign.com/com/v1/'],
    ],
    [['XN--P1AI'], ['https://rdap.tcinet.ru']],
    [['insecure'], ['http://only-http.example/']],
  ],
};

describe('parseRdapBootstrap', () => {
  it('maps each TLD to its first https base URL with a trailing slash', () => {
    const { servers } = parseRdapBootstrap(BOOTSTRAP);
    expect(servers['nl']).toBe('https://rdap.sidn.nl/');
    expect(servers['com']).toBe('https://rdap.verisign.com/com/v1/');
    expect(servers['net']).toBe('https://rdap.verisign.com/com/v1/');
    expect(servers['xn--p1ai']).toBe('https://rdap.tcinet.ru/');
    expect(servers['insecure']).toBeUndefined();
  });

  it('lists unique sorted https origins for the CSP connect-src', () => {
    const { hosts } = parseRdapBootstrap(BOOTSTRAP);
    expect(hosts).toEqual([
      'https://rdap.sidn.nl',
      'https://rdap.tcinet.ru',
      'https://rdap.verisign.com',
    ]);
  });
});
