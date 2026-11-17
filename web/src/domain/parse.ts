import { toASCII, toUnicode } from 'punycode/';
import { parse } from 'tldts';

/** A variant (the domain the user typed), normalised to its registrable domain. */
export interface ParsedVariant {
  /** What the user typed, untouched. */
  input: string;
  /** Full hostname in Unicode (`tudеlft.nl`). */
  unicode: string;
  /** Full hostname in ASCII/punycode (`xn--tudlft-...nl`). */
  punycode: string;
  /** Registrable domain per the Public Suffix List, punycode form (`evil.com`). */
  registrableDomain: string;
  /** Registrable domain without its public suffix, Unicode form (`tudеlft`). */
  label: string;
  /** Public suffix (`nl`, `co.uk`). */
  tld: string;
  /** Labels left of the registrable domain, outermost first (`['login', 'tudelft', 'nl']`). */
  subdomains: string[];
  /** The subdomain part is itself a domain (`tudelft.nl.evil.com`). */
  isSubdomainTrick: boolean;
}

export class InvalidVariantError extends Error {
  constructor(input: string, reason: string) {
    super(`"${input}" is not a valid domain: ${reason}`);
    this.name = 'InvalidVariantError';
  }
}

const LDH_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** Strip a pasted URL down to its hostname, lowercase and NFC-normalise it. */
function toHostname(input: string): string {
  let host = input.trim().normalize('NFC').toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  host = host.replace(/[/?#].*$/, ''); // path, query, fragment
  host = host.replace(/^[^@]*@/, ''); // userinfo
  host = host.replace(/:\d*$/, ''); // port
  host = host.replace(/[。．｡]/g, '.'); // ideographic full stops
  return host.replace(/\.$/, '');
}

/**
 * Parse user input into a variant. Accepts Unicode or `xn--` input (and pasted URLs).
 * @throws {InvalidVariantError} when the input is not a registrable hostname.
 */
export function parseVariant(input: string): ParsedVariant {
  const host = toHostname(input);
  if (host === '') throw new InvalidVariantError(input, 'it is empty');
  if (/\s/.test(host)) throw new InvalidVariantError(input, 'it contains spaces');

  let ascii: string;
  let unicode: string;
  try {
    ascii = toASCII(host);
    unicode = toUnicode(ascii);
  } catch {
    throw new InvalidVariantError(input, 'it contains invalid punycode');
  }
  if (ascii.length > 253) throw new InvalidVariantError(input, 'it is longer than 253 characters');
  const labels = ascii.split('.');
  const bad = labels.find((l) => !LDH_LABEL.test(l));
  if (bad !== undefined) {
    throw new InvalidVariantError(
      input,
      bad === '' ? 'it has an empty label' : `label "${bad}" has invalid characters or length`,
    );
  }

  const info = parse(ascii);
  if (info.isIp) throw new InvalidVariantError(input, 'it is an IP address');
  if (!info.isIcann || info.domain === null || info.publicSuffix === null) {
    throw new InvalidVariantError(input, 'it has no known public suffix (e.g. .nl, .com)');
  }

  const sub = info.subdomain ?? '';
  const subInfo = sub === '' ? null : parse(sub);
  return {
    input,
    unicode,
    punycode: ascii,
    registrableDomain: info.domain,
    label: toUnicode(info.domainWithoutSuffix ?? ''),
    tld: info.publicSuffix,
    subdomains: sub === '' ? [] : sub.split('.'),
    isSubdomainTrick: subInfo !== null && subInfo.isIcann === true && subInfo.domain !== null,
  };
}
