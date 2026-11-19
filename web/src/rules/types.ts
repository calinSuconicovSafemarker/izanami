import type { Similarity } from '../domain';

/**
 * A fact gathered from a lookup. `unknown` means the lookup failed or has not
 * finished yet (`pending`); rules turn either into an `unknown` result.
 */
export type Fact<T> = { state: 'known'; value: T } | { state: 'unknown' } | { state: 'pending' };

export const known = <T>(value: T): Fact<T> => ({ state: 'known', value });
export const UNKNOWN: Fact<never> = { state: 'unknown' };
export const PENDING: Fact<never> = { state: 'pending' };

/** Existence states from the SPEC. */
export type Existence = 'not-registered' | 'registered-not-resolving' | 'resolving';

/** The variant is known not to be registered (no verdict is shown: "no active threat"). */
export const isNotRegistered = (existence: Fact<Existence>): boolean =>
  existence.state === 'known' && existence.value === 'not-registered';

/** What `gatherFacts` needs to know about the organisation (subset of an orgs.json entry). */
export interface OrgInput {
  slug: string;
  name: string;
  /** ISO 3166-1 alpha-2 country code, e.g. `NL`. */
  country: string;
  primaryDomain: string;
  officialDomains: readonly string[];
  /** e.g. `tudelft`. */
  brandLabel: string;
}

/** Infrastructure facts collected for both the variant and the official domain. */
export interface InfraFacts {
  /** Registrable domain, punycode. */
  domain: string;
  /** ISO 8601. */
  registrationDate: Fact<string>;
  registrar: Fact<string>;
  /** Lower-case NS host names (DNS, falling back to RDAP). */
  nameservers: Fact<string[]>;
  /** Lower-case MX host names, preference stripped. */
  mx: Fact<string[]>;
  /** Origin ASNs of the A/AAAA addresses. */
  asns: Fact<number[]>;
}

export interface VariantFacts extends InfraFacts {
  /** Unicode form of the registrable domain. */
  unicode: string;
  /** Public suffix, e.g. `nl` or `co.uk`. */
  tld: string;
  similarity: Similarity;
  /** Brand label the variant was compared against. */
  brandLabel: string;
  orgName: string;
  /** ISO 3166-1 alpha-2 country code of the organisation. */
  orgCountry: string;
  /** Registrable domain is in the bundled Tranco top 100k. */
  inTranco: boolean;
  existence: Fact<Existence>;
  /** A TXT record starting with `v=spf1` exists. */
  spf: Fact<boolean>;
  /** Earliest CT `notBefore` (ISO 8601), or `null` when no certificate was ever logged. */
  firstCertDate: Fact<string | null>;
  /** When the facts were gathered (ISO 8601); rules measure ages from here. */
  checkedAt: string;
}

export type OfficialFacts = InfraFacts;

/** Variant facts that come from a lookup (and can therefore be pending or unknown). */
export type LookupFact = {
  [K in keyof VariantFacts]: VariantFacts[K] extends Fact<unknown> ? K : never;
}[keyof VariantFacts];

export interface Facts {
  variantFacts: VariantFacts;
  officialFacts: OfficialFacts;
}

export type RuleId =
  | 'official-match'
  | 'young-domain'
  | 'much-newer'
  | 'brand-lookalike'
  | 'not-in-tranco'
  | 'same-nameservers'
  | 'same-registrar'
  | 'same-mx'
  | 'same-asn'
  | 'no-mx'
  | 'mail-ready'
  | 'fresh-cert'
  | 'registered-not-resolving'
  | 'odd-tld';

/**
 * `not-applicable`: the rule does not apply to this variant (e.g. `brand-lookalike` for a domain
 * that is not a lookalike at all); it is left out of the score and of the unknown share.
 */
export type RuleStatus = 'fired' | 'not-fired' | 'unknown' | 'not-applicable';

export interface RuleResult {
  id: RuleId;
  status: RuleStatus;
  /** Score contribution when fired (positive = riskier, negative = more legit). */
  weight: number;
  /** Plain English, with concrete values. */
  explanation: string;
  /** Short phrase with the concrete value, e.g. `Registered 12 days ago` (the "Why" list). */
  summary: string;
}

export type Rule = (variant: VariantFacts, official: OfficialFacts) => RuleResult;
