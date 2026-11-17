import { rdapBaseUrl, rdapHosts } from './rdap';

describe('RDAP hosts from the IANA bootstrap', () => {
  it('maps TLDs to their RDAP base URL', () => {
    expect(rdapBaseUrl('nl')).toBe('https://rdap.sidn.nl/');
    expect(rdapBaseUrl('com')).toBe('https://rdap.verisign.com/com/v1/');
    expect(rdapBaseUrl('COM.')).toBe('https://rdap.verisign.com/com/v1/');
    expect(rdapBaseUrl('not-a-tld')).toBeUndefined();
  });

  it('lists RDAP origins for the CSP connect-src', () => {
    expect(rdapHosts).toContain('https://rdap.sidn.nl');
    expect(rdapHosts).toContain('https://rdap.verisign.com');
  });
});
