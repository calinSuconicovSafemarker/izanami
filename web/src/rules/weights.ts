// All scoring knobs in one place (ADR-0003, SPEC "Rules engine").
// Positive = riskier, negative = more legit.

export const WEIGHTS = {
  youngDomain: 40,
  muchNewer: 15,
  brandLookalike: 25,
  brandHomoglyph: 35,
  notInTranco: 10,
  sameNameservers: -40,
  sameRegistrar: -25,
  sameBrandRegistrar: -35,
  sameMx: -15,
  sameAsn: -15,
  noMx: 10,
  mailReady: 15,
  freshCert: 20,
  registeredNotResolving: 20,
  oddTld: 10,
  /** Wikidata lists the domain as owned by the org: legit, but never a short-circuit (R1). */
  listedRelated: -30,
} as const;

export const THRESHOLDS = {
  /** Score ≤ this → Likely legit. */
  likelyLegitMax: 0,
  /** Score ≥ this → Likely fraud; in between → Suspicious. */
  likelyFraudMin: 40,
  /** Unknown share of applicable absolute weight above this → Insufficient data. */
  maxUnknownShare: 0.5,
} as const;

export const AGES = {
  youngDomainDays: 90,
  muchNewerYears: 5,
  freshCertDays: 30,
} as const;

/**
 * Corporate brand-protection registrars, matched as lower-case substrings of
 * the RDAP registrar name. Sharing one of these with the official domain is a
 * strong defensive-registration signal.
 */
export const BRAND_REGISTRARS = [
  'markmonitor',
  'csc corporate domains',
  'corporation service company',
  'com laude',
  'safenames',
  'nameshield',
  'ebrand',
  'brandshelter',
  'gandi corporate',
  'lexsynergy',
  '101domain',
] as const;

// TLD lists live in tld/lists.ts (one source for the rules and the TLD rating).
export { ABUSE_HEAVY_TLDS, GENERIC_TLDS } from '../tld/lists';
