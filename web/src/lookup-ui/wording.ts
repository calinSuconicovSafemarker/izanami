import type { Org } from '../orgs';
import type { Existence } from '../rules';

/** Generic TLDs offered next to the org's ccTLD; the last few are abuse-heavy. */
const QUICK_TLDS = ['com', 'net', 'org', 'xyz', 'top', 'online', 'shop', 'info'] as const;

/** ISO 3166-1 alpha-2 → ccTLD (they match except for the UK). */
const ccTld = (country: string) => (country.toUpperCase() === 'GB' ? 'uk' : country.toLowerCase());

export function quickTlds(org: Org): string[] {
  const cc = org.country ? ccTld(org.country) : undefined;
  return [...new Set([...(cc ? [cc] : []), ...QUICK_TLDS])];
}

/** Replace everything after the first label with `tld` (`tudelft-login.nl` + `com` → `tudelft-login.com`). */
export function withTld(input: string, tld: string, fallbackLabel: string) {
  const label = input.trim().split('.')[0] || fallbackLabel;
  return `${label}.${tld}`;
}

export const EXISTENCE_WORDING: Record<Existence, string> = {
  'not-registered': 'Not registered — no active threat right now.',
  'registered-not-resolving': 'Registered but not live yet — worth watching.',
  resolving: 'Resolving — this domain is live.',
};
