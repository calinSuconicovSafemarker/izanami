import { rateTld, type TldCategory, type TldRating } from './rating';

/** Offered on every org: legacy generics, then common abuse-heavy TLDs (shown as such). */
const QUICK_TLDS = ['com', 'net', 'org', 'info', 'xyz', 'top', 'online', 'shop'] as const;

/** ISO 3166-1 alpha-2 → ccTLD (they match except for the UK). */
export const ccTld = (country: string) =>
  country.toUpperCase() === 'GB' ? 'uk' : country.toLowerCase();

const ORDER: Record<TldCategory, number> = {
  official: 0,
  country: 0,
  generic: 1,
  brand: 1,
  other: 2,
  'high-abuse': 3,
};

export interface QuickPickOrg {
  country: string | null;
  officialDomains: readonly string[];
}

/**
 * Quick-pick TLD chips for an org, rated: the org's ccTLD first, then generic TLDs,
 * high-abuse TLDs last so they are never presented as neutral.
 */
export function quickPickTlds(org: QuickPickOrg, brandTlds?: readonly string[]): TldRating[] {
  const cc = org.country ? [ccTld(org.country)] : [];
  const tlds = [...new Set([...cc, ...QUICK_TLDS])];
  const ctx = { officialDomains: org.officialDomains, brandTlds };
  return tlds
    .map((t, i) => ({ rating: rateTld(t, ctx), i }))
    .sort((a, b) => ORDER[a.rating.category] - ORDER[b.rating.category] || a.i - b.i)
    .map((x) => x.rating);
}
