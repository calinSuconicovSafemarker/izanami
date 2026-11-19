// Which lookups the rules depend on: lets the UI tell rules still waiting for a
// lookup from rules whose lookup failed, and name the failed sources.
import { RULE_INPUTS } from './rules';
import type { Facts, LookupFact, RuleResult, VariantFacts } from './types';

/** Variant facts, or the subset of them the official side has. */
type LookedUp = Partial<Pick<VariantFacts, LookupFact>>;

/** Which lookup each fact comes from. */
export const FACT_SOURCES: Record<LookupFact, string> = {
  existence: 'DNS',
  nameservers: 'DNS',
  mx: 'DNS',
  spf: 'DNS',
  registrationDate: 'RDAP',
  registrar: 'RDAP',
  addresses: 'DNS',
  asns: 'ASN',
  firstCertDate: 'Certificate Transparency (crt.sh)',
};

const stateOf = (facts: LookedUp, key: LookupFact) => facts[key]?.state;

/** The rule is unknown only because one of its inputs is still pending. */
export function isAwaitingLookup(r: RuleResult, { variantFacts, officialFacts }: Facts): boolean {
  return (
    r.status === 'unknown' &&
    RULE_INPUTS[r.id].some(
      (k) => stateOf(variantFacts, k) === 'pending' || stateOf(officialFacts, k) === 'pending',
    )
  );
}

/** Lookup sources (DNS, RDAP, …) with at least one unknown fact, each once, in a stable order. */
export function unknownSources(facts: LookedUp): string[] {
  const keys = Object.keys(FACT_SOURCES) as LookupFact[];
  return [
    ...new Set(keys.filter((k) => stateOf(facts, k) === 'unknown').map((k) => FACT_SOURCES[k])),
  ];
}
