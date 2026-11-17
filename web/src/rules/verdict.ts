import type { RuleResult } from './types';
import { THRESHOLDS } from './weights';

export type VerdictLabel =
  'Official' | 'Likely legit' | 'Suspicious' | 'Likely fraud' | 'Insufficient data';

export interface Verdict {
  verdict: VerdictLabel;
  /** Sum of the weights of fired rules. */
  score: number;
  /** Share (0–1) of the applicable rules' absolute weight whose status is unknown. */
  unknownShare: number;
}

/**
 * Combine rule results per ADR-0003. Every rule except `official-match` and rules reported
 * `not-applicable` counts towards the score and the unknown share.
 */
export function verdict(results: readonly RuleResult[]): Verdict {
  const official = results.some((r) => r.id === 'official-match' && r.status === 'fired');
  const applicable = results.filter(
    (r) => r.id !== 'official-match' && r.status !== 'not-applicable',
  );
  const score = applicable.filter((r) => r.status === 'fired').reduce((s, r) => s + r.weight, 0);
  const total = applicable.reduce((s, r) => s + Math.abs(r.weight), 0);
  const unknown = applicable
    .filter((r) => r.status === 'unknown')
    .reduce((s, r) => s + Math.abs(r.weight), 0);
  const unknownShare = total === 0 ? 0 : unknown / total;

  if (official) return { verdict: 'Official', score: 0, unknownShare };
  const label: VerdictLabel =
    unknownShare > THRESHOLDS.maxUnknownShare
      ? 'Insufficient data'
      : score <= THRESHOLDS.likelyLegitMax
        ? 'Likely legit'
        : score >= THRESHOLDS.likelyFraudMin
          ? 'Likely fraud'
          : 'Suspicious';
  return { verdict: label, score, unknownShare };
}
