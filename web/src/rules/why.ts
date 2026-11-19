// The "Why" list under the verdict: the few rule outcomes that explain it, as short phrases.
import { evaluate } from './evaluate';
import type { Facts, RuleId, RuleResult } from './types';
import { isNotRegistered } from './types';
import { verdict } from './verdict';

export interface WhyItem {
  id: RuleId;
  /** `risk`/`legit`: a fired signal; `unknown`: something that couldn't be checked. */
  kind: 'risk' | 'legit' | 'unknown';
  /** Signed score contribution (the rule's weight). */
  weight: number;
  summary: string;
}

/** At most this many reasons are listed. */
export const WHY_MAX = 4;

const byAbsWeight = (a: RuleResult, b: RuleResult) => Math.abs(b.weight) - Math.abs(a.weight);

/**
 * The top reasons behind the verdict, largest |weight| first (ties keep display order):
 * fired signals, or — for Insufficient data — what couldn't be checked. Empty for an official
 * or unregistered domain (no verdict to explain).
 */
export function whyList(facts: Facts, results: readonly RuleResult[] = evaluate(facts)): WhyItem[] {
  if (isNotRegistered(facts.variantFacts.existence)) return [];
  const v = verdict(results);
  if (v.verdict === 'Official') return [];
  const insufficient = v.verdict === 'Insufficient data';
  const picked = results.filter((r) =>
    insufficient
      ? r.status === 'unknown' && r.id !== 'official-match'
      : r.status === 'fired' && r.weight !== 0,
  );
  const seen = new Set<string>();
  return [...picked]
    .sort(byAbsWeight)
    .filter((r) => !seen.has(r.summary) && seen.add(r.summary))
    .slice(0, WHY_MAX)
    .map((r) => ({
      id: r.id,
      kind: insufficient ? 'unknown' : r.weight > 0 ? 'risk' : 'legit',
      weight: r.weight,
      summary: r.summary,
    }));
}
