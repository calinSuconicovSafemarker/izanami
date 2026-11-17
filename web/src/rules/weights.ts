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

/** gTLDs common enough that they are never "odd". */
export const COMMON_GTLDS = ['com', 'org', 'net', 'edu', 'gov', 'int', 'eu'] as const;

/**
 * TLDs over-represented in phishing/abuse reports (Spamhaus, Interisle).
 * Only these can fire `odd-tld`.
 */
export const ABUSE_HEAVY_TLDS = [
  'xyz',
  'top',
  'icu',
  'buzz',
  'club',
  'online',
  'site',
  'shop',
  'live',
  'click',
  'link',
  'cfd',
  'sbs',
  'bond',
  'cyou',
  'rest',
  'monster',
  'quest',
  'work',
  'support',
  'zip',
  'mov',
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
] as const;
