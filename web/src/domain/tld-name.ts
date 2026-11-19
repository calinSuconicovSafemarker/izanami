import { toASCII } from 'punycode/';

/**
 * The one comparison form of a TLD or public suffix: punycode, lower case, no leading dot
 * (`.ГУГЛ` → `xn--...`). Every brand-TLD comparison goes through this.
 */
export function normaliseTld(tld: string): string {
  return toASCII(tld.trim().replace(/^\./, '').toLowerCase());
}
