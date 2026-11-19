import type { Existence } from '../rules';

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
