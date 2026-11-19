import { parse } from 'tldts';
import { normaliseTld } from '../domain';
import { brandTldOwners } from '../orgs';
import { isAbuseHeavy, isGeneric, isoOfCcTld } from './lists';

/**
 * How trustworthy a TLD is for a given org, strongest first:
 * - `official`   one of this org's brand TLDs, or a public suffix of one of its official domains
 * - `brand`      a brand TLD another organisation runs (`.google` on Apple's page), owner named
 * - `high-abuse` cheap TLDs over-represented in phishing reports (`ABUSE_HEAVY_TLDS` in
 *                tld/lists.ts: Spamhaus, Interisle)
 * - `country`    a two-letter ccTLD
 * - `generic`    a legacy generic TLD (.com, .net, .org …)
 * - `other`      any other gTLD
 */
export type TldCategory = 'official' | 'brand' | 'high-abuse' | 'country' | 'generic' | 'other';

export interface TldRating {
  /** Lower-case, no leading dot (`co.uk`). */
  tld: string;
  category: TldCategory;
  /** Short badge text, readable without colour (`country · France`, `brand TLD (Google)`). */
  label: string;
  /** Country name for ccTLDs (also set when a ccTLD is rated official or high-abuse). */
  country?: string;
}

/** The org side of a rating; an `OfficialContext` (orgs/official.ts) fits as is. */
export interface TldContext {
  /** The org's official domains; their public suffixes rate as `official`. */
  officialDomains?: readonly string[];
  /** The org's own brand TLDs (no dot), e.g. `['google']`; they rate as `official`. */
  brandTlds?: readonly string[];
}

let regionNames: Intl.DisplayNames | undefined;

function countryName(cc: string): string | undefined {
  if (!/^[a-z]{2}$/.test(cc)) return undefined;
  regionNames ??= new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  try {
    return regionNames.of(isoOfCcTld(cc));
  } catch {
    return undefined;
  }
}

/** Public suffixes of the given domains (`google.co.uk` → `co.uk`). */
export function suffixesOf(domains: readonly string[]): Set<string> {
  return new Set(domains.flatMap((d) => parse(d).publicSuffix ?? []));
}

const LABELS: Record<Exclude<TldCategory, 'country' | 'brand'>, string> = {
  official: 'official',
  'high-abuse': 'high-abuse',
  generic: 'generic',
  other: 'other gTLD',
};

/** Rate one TLD (or multi-label public suffix) for an org. */
export function rateTld(input: string, ctx: TldContext = {}): TldRating {
  const tld = input.trim().toLowerCase().replace(/^\./, '');
  const ascii = normaliseTld(tld);
  const last = tld.slice(tld.lastIndexOf('.') + 1);
  const country = countryName(last);
  const owners = brandTldOwners(ascii);
  const rating = (category: TldCategory): TldRating => ({
    tld,
    category,
    label:
      category === 'country'
        ? `country · ${country}`
        : category === 'brand'
          ? `brand TLD (${owners.join(', ')})`
          : LABELS[category],
    ...(country ? { country } : {}),
  });

  if (ctx.brandTlds?.some((b) => normaliseTld(b) === ascii)) return rating('official');
  if (ctx.officialDomains && suffixesOf(ctx.officialDomains).has(tld)) return rating('official');
  if (owners.length) return rating('brand');
  if (isAbuseHeavy(tld)) return rating('high-abuse');
  if (country) return rating('country');
  if (isGeneric(tld)) return rating('generic');
  return rating('other');
}
