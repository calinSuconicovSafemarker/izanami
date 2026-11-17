import { domainToASCII } from 'node:url';
import { getDomain } from 'tldts';

/**
 * Registrable domain (eTLD+1, punycode) of a hostname, or null for suffixes, IPs and empty input.
 * Uses `tldts` with ICANN suffixes only, exactly like the web runtime's `parseVariant`, so build
 * and runtime agree on what a registrable domain is.
 */
export function registrableDomain(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const ascii = host && domainToASCII(host);
  if (!ascii) return null;
  return getDomain(ascii, { allowPrivateDomains: false });
}
