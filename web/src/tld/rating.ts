import { parse } from 'tldts';
import { ABUSE_HEAVY_TLDS } from '../rules/weights';

/**
 * How trustworthy a TLD is for a given org, strongest first:
 * - `official`   a public suffix of one of the org's official domains
 * - `brand`      a single-owner TLD (`.google`), supplied by the caller
 * - `high-abuse` cheap TLDs over-represented in phishing reports — the curated
 *                `ABUSE_HEAVY_TLDS` list in rules/weights.ts (Spamhaus, Interisle)
 * - `country`    a two-letter ccTLD
 * - `generic`    a legacy generic TLD (.com, .net, .org …)
 * - `other`      any other gTLD
 */
export type TldCategory = 'official' | 'brand' | 'high-abuse' | 'country' | 'generic' | 'other';

export interface TldRating {
  /** Lower-case, no leading dot (`co.uk`). */
  tld: string;
  category: TldCategory;
  /** Short badge text, readable without colour (`country · France`). */
  label: string;
  /** Country name for ccTLDs (also set when a ccTLD is rated official or high-abuse). */
  country?: string;
}

export interface TldContext {
  /** The org's official domains; their public suffixes rate as `official`. */
  officialDomains?: readonly string[];
  /** Single-owner TLDs (no dot), e.g. `['google']`. */
  brandTlds?: readonly string[];
}

/** Legacy generic TLDs, open or restricted, that are not abuse-heavy. */
export const GENERIC_TLDS = [
  'com',
  'net',
  'org',
  'info',
  'biz',
  'name',
  'pro',
  'edu',
  'gov',
  'int',
  'mil',
  'mobi',
] as const;

/** ccTLDs whose ISO 3166-1 code differs from the TLD. */
const CC_TO_ISO: Record<string, string> = { uk: 'GB' };

let regionNames: Intl.DisplayNames | undefined;

function countryName(cc: string): string | undefined {
  if (!/^[a-z]{2}$/.test(cc)) return undefined;
  regionNames ??= new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  try {
    return regionNames.of(CC_TO_ISO[cc] ?? cc.toUpperCase());
  } catch {
    return undefined;
  }
}

const abuse = new Set<string>(ABUSE_HEAVY_TLDS);
const generic = new Set<string>(GENERIC_TLDS);

/** Public suffixes of the given domains (`google.co.uk` → `co.uk`). */
export function suffixesOf(domains: readonly string[]): Set<string> {
  return new Set(domains.flatMap((d) => parse(d).publicSuffix ?? []));
}

const LABELS: Record<Exclude<TldCategory, 'country'>, string> = {
  official: 'official',
  brand: 'brand',
  'high-abuse': 'high-abuse',
  generic: 'generic',
  other: 'other gTLD',
};

/** Rate one TLD (or multi-label public suffix) for an org. Pure. */
export function rateTld(input: string, ctx: TldContext = {}): TldRating {
  const tld = input.trim().toLowerCase().replace(/^\./, '');
  const last = tld.slice(tld.lastIndexOf('.') + 1);
  const country = countryName(last);
  const rating = (category: TldCategory): TldRating => ({
    tld,
    category,
    label: category === 'country' ? `country · ${country}` : LABELS[category],
    ...(country ? { country } : {}),
  });

  if (ctx.officialDomains && suffixesOf(ctx.officialDomains).has(tld)) return rating('official');
  if (ctx.brandTlds?.some((b) => b.toLowerCase() === tld)) return rating('brand');
  if (abuse.has(tld)) return rating('high-abuse');
  if (country) return rating('country');
  if (generic.has(tld)) return rating('generic');
  return rating('other');
}
