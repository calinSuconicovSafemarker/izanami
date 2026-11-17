import { toASCII, toUnicode } from 'punycode/';
import { skeleton } from '../lib/skeleton';
import type { ParsedVariant } from './parse';

export type LookalikeKind =
  'official' | 'tld-swap' | 'typo' | 'homoglyph' | 'combo' | 'subdomain-trick' | 'unrelated';

export interface Similarity {
  /** Registrable domain is one of the known official domains. */
  isOfficial: boolean;
  /** Optimal-string-alignment distance between the variant label and the brand label. */
  editDistance: number;
  /** Variant label differs from the brand but has the same confusables skeleton. */
  homoglyph: boolean;
  /** Variant label strictly contains the brand label (skeleton-wise), e.g. `tudelft-login`. */
  containsBrand: boolean;
  /** Same label as the brand (or an official domain), different public suffix. */
  tldSwap: boolean;
  /** Most specific lookalike class; precedence follows the declaration order of the checks. */
  kind: LookalikeKind;
}

/** Brands this short get edit distance ≤ 1 only; otherwise nearly every short label is a "typo". */
const SHORT_BRAND = 4;

/** Optimal string alignment distance (Levenshtein + adjacent transposition), per code point. */
export function editDistance(a: string, b: string): number {
  const s = [...a];
  const t = [...b];
  const d: number[][] = Array.from({ length: s.length + 1 }, (_, i) =>
    Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => d[i]?.[j] ?? Infinity;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      d[i]![j] = best;
    }
  }
  return at(s.length, t.length);
}

const labelOf = (domain: string) => domain.split('.')[0] ?? '';

/**
 * Measure how close a variant is to an organisation's brand.
 * `officialDomains` are registrable domains in Unicode or punycode form.
 */
export function similarity(
  variant: ParsedVariant,
  brandLabel: string,
  officialDomains: readonly string[],
): Similarity {
  const brand = brandLabel.toLowerCase();
  const brandSkel = skeleton(brand);
  const label = variant.label;
  const labelSkel = skeleton(label);
  const officials = officialDomains.map((d) => toASCII(d.toLowerCase()));

  const isOfficial = officials.includes(variant.registrableDomain);
  const distance = editDistance(label, brand);
  const homoglyph = label !== brand && labelSkel === brandSkel;
  const containsBrand = labelSkel !== brandSkel && labelSkel.includes(brandSkel);
  const officialLabels = new Set([brand, ...officials.map((d) => toUnicode(labelOf(d)))]);
  const tldSwap = !isOfficial && officialLabels.has(label);
  const brandInSubdomain = variant.subdomains.some((s) => skeleton(s).includes(brandSkel));
  const maxTypo = [...brand].length <= SHORT_BRAND ? 1 : 2;

  const kind: LookalikeKind = isOfficial
    ? 'official'
    : brandInSubdomain
      ? 'subdomain-trick'
      : tldSwap
        ? 'tld-swap'
        : homoglyph
          ? 'homoglyph'
          : distance >= 1 && distance <= maxTypo
            ? 'typo'
            : containsBrand
              ? 'combo'
              : 'unrelated';

  return { isOfficial, editDistance: distance, homoglyph, containsBrand, tldSwap, kind };
}
