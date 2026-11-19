import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { caseFacts, cases } from './fixtures/cases';
import { verdict } from './verdict';

describe('fixtures/cases.json', () => {
  it('has at least 8 cases', () => {
    expect(cases.cases.length).toBeGreaterThanOrEqual(8);
  });

  it.each(cases.cases)('$name ($variant) → $expected', (c) => {
    expect(verdict(evaluate(caseFacts(c))).verdict).toBe(c.expected);
  });

  it('always reports every rule, unknown ones included', () => {
    const allUnknown = cases.cases.find((c) => c.expected === 'Insufficient data')!;
    const results = evaluate(caseFacts(allUnknown));
    expect(results).toHaveLength(15);
    expect(results.filter((r) => r.status === 'unknown').length).toBeGreaterThan(5);
  });
});
