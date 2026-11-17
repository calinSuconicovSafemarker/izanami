import { describe, expect, it } from 'vitest';
import type { RuleId, RuleResult, RuleStatus } from './types';
import { verdict } from './verdict';

const r = (id: RuleId, status: RuleStatus, weight: number): RuleResult => ({
  id,
  status,
  weight,
  explanation: `${id} ${status}`,
});

describe('verdict', () => {
  it.each([
    {
      name: 'official-match short-circuits even with risky signals',
      results: [r('official-match', 'fired', 0), r('young-domain', 'fired', 40)],
      expected: 'Official',
      score: 0,
    },
    {
      name: 'score 0 is Likely legit',
      results: [
        r('official-match', 'not-fired', 0),
        r('brand-lookalike', 'fired', 25),
        r('same-registrar', 'fired', -25),
      ],
      expected: 'Likely legit',
      score: 0,
    },
    {
      name: 'negative score is Likely legit',
      results: [r('brand-lookalike', 'fired', 25), r('same-nameservers', 'fired', -40)],
      expected: 'Likely legit',
      score: -15,
    },
    {
      name: 'score 1 is Suspicious',
      results: [
        r('brand-lookalike', 'fired', 25),
        r('same-registrar', 'fired', -25),
        r('odd-tld', 'not-fired', 10),
        r('no-mx', 'fired', 1),
      ],
      expected: 'Suspicious',
      score: 1,
    },
    {
      name: 'score 39 is Suspicious',
      results: [
        r('brand-lookalike', 'fired', 25),
        r('odd-tld', 'fired', 10),
        r('no-mx', 'fired', 4),
      ],
      expected: 'Suspicious',
      score: 39,
    },
    {
      name: 'score 40 is Likely fraud',
      results: [r('young-domain', 'fired', 40), r('same-mx', 'not-fired', -15)],
      expected: 'Likely fraud',
      score: 40,
    },
    {
      name: 'unknown weight exactly half is still scored',
      results: [
        r('young-domain', 'unknown', 40),
        r('brand-lookalike', 'fired', 25),
        r('odd-tld', 'not-fired', 15),
      ],
      expected: 'Suspicious',
      score: 25,
    },
    {
      name: 'unknown weight over half is Insufficient data (absolute weights)',
      results: [
        r('same-nameservers', 'unknown', -40),
        r('young-domain', 'unknown', 40),
        r('brand-lookalike', 'fired', 25),
        r('not-in-tranco', 'fired', 10),
      ],
      expected: 'Insufficient data',
      score: 35,
    },
    {
      name: 'all unknown is Insufficient data',
      results: [
        r('official-match', 'not-fired', 0),
        r('young-domain', 'unknown', 40),
        r('same-asn', 'unknown', -15),
      ],
      expected: 'Insufficient data',
      score: 0,
    },
  ])('$name', ({ results, expected, score }) => {
    const v = verdict(results);
    expect(v.verdict).toBe(expected);
    expect(v.score).toBe(score);
  });

  it('reports the unknown share of applicable weight', () => {
    expect(
      verdict([r('young-domain', 'unknown', 40), r('same-nameservers', 'fired', -40)]).unknownShare,
    ).toBe(0.5);
  });
});
