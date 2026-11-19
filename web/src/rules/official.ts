import { toUnicode } from 'punycode/';

/**
 * Why a variant is official, as one sentence: a known official domain, or a domain under a TLD
 * the organisation operates (ticket 14). Shared by the `official-match` rule, the terminal and the
 * Official verdict card so the wording stays the same.
 */
export function officialExplanation(domain: string, orgName: string, brandTld?: string): string {
  return brandTld
    ? `${orgName} operates the .${toUnicode(brandTld)} top-level domain, so ${domain} is theirs.`
    : `${domain} is a known official domain of ${orgName}.`;
}
