import { describe, expect, it } from 'vitest';
import { parseVariant, similarity } from '../domain';
import { evaluate } from './evaluate';
import cases from './fixtures/cases.json';
import type { Existence, Fact, OfficialFacts, VariantFacts } from './types';
import { known, UNKNOWN } from './types';
import { verdict } from './verdict';

type Org = (typeof cases.orgs)['tudelft'];

const fact = <T>(v: T | '?'): Fact<T> => (v === '?' ? UNKNOWN : known(v as T));

function build(c: (typeof cases.cases)[number]): { v: VariantFacts; o: OfficialFacts } {
  const org = (cases.orgs as Record<string, Org>)[c.org]!;
  const parsed = parseVariant(c.variant);
  const f = c.facts;
  const v: VariantFacts = {
    domain: parsed.registrableDomain,
    unicode: parsed.unicode,
    tld: parsed.tld,
    brandLabel: org.brandLabel,
    orgName: org.name,
    orgCountry: org.country,
    similarity: similarity(parsed, org.brandLabel, org.officialDomains),
    inTranco: f.inTranco,
    existence: fact(f.existence as Existence | '?'),
    registrationDate: fact(f.registrationDate),
    registrar: fact(f.registrar),
    nameservers: fact(f.nameservers as string[] | '?'),
    mx: fact(f.mx as string[] | '?'),
    spf: fact(f.spf as boolean | '?'),
    asns: fact(f.asns as number[] | '?'),
    firstCertDate: fact(f.firstCertDate as string | null | '?'),
    checkedAt: cases.checkedAt,
  };
  const of = org.facts;
  const o: OfficialFacts = {
    domain: org.primaryDomain,
    registrationDate: known(of.registrationDate),
    registrar: known(of.registrar),
    nameservers: known(of.nameservers),
    mx: known(of.mx),
    asns: known(of.asns),
  };
  return { v, o };
}

describe('fixtures/cases.json', () => {
  it('has at least 8 cases', () => {
    expect(cases.cases.length).toBeGreaterThanOrEqual(8);
  });

  it.each(cases.cases)('$name ($variant) → $expected', (c) => {
    const { v, o } = build(c);
    const results = evaluate({ variantFacts: v, officialFacts: o });
    expect(verdict(results).verdict).toBe(c.expected);
  });

  it('always reports every rule, unknown ones included', () => {
    const allUnknown = cases.cases.find((c) => c.expected === 'Insufficient data')!;
    const { v, o } = build(allUnknown);
    const results = evaluate({ variantFacts: v, officialFacts: o });
    expect(results).toHaveLength(14);
    expect(results.filter((r) => r.status === 'unknown').length).toBeGreaterThan(5);
  });
});
