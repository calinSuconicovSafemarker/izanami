import { RULES } from './rules';
import type { Facts, RuleResult } from './types';

/** Run every rule (display order) against the facts. Pure; safe to call on partial facts. */
export function evaluate({ variantFacts, officialFacts }: Facts): RuleResult[] {
  return Object.values(RULES).map((rule) => rule(variantFacts, officialFacts));
}
