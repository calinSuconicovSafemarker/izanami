// Builds engine Facts from fixtures/cases.json (shared by the engine and verdict-card tests).
import { parseVariant, similarity } from '../../domain';
import type { Existence, Fact, Facts } from '../types';
import { known, UNKNOWN } from '../types';
import cases from './cases.json';

export { cases };
export type VerdictCase = (typeof cases.cases)[number];
type CaseOrg = (typeof cases.orgs)['tudelft'];

const fact = <T>(v: T | '?'): Fact<T> => (v === '?' ? UNKNOWN : known(v as T));

export function caseFacts(c: VerdictCase): Facts {
  const org = (cases.orgs as Record<string, CaseOrg>)[c.org]!;
  const parsed = parseVariant(c.variant);
  const f = c.facts;
  const of = org.facts;
  return {
    variantFacts: {
      domain: parsed.registrableDomain,
      unicode: parsed.unicode,
      tld: parsed.tld,
      brandLabel: org.brandLabel,
      orgName: org.name,
      orgCountry: org.country,
      similarity: similarity(parsed, org.brandLabel, org.officialDomains),
      inPopularTop100k: f.inPopularTop100k,
      existence: fact(f.existence as Existence | '?'),
      // The cases record no RDAP failures separately; an unknown date counts as unpublished.
      rdap: known(f.existence === 'not-registered' ? 'not-found' : 'ok'),
      registrationDate: fact(f.registrationDate),
      registrar: fact(f.registrar),
      nameservers: fact(f.nameservers as string[] | '?'),
      mx: fact(f.mx as string[] | '?'),
      spf: fact(f.spf as boolean | '?'),
      addresses: fact(f.asns === '?' ? '?' : []),
      asns: fact(f.asns as number[] | '?'),
      firstCertDate: fact(f.firstCertDate as string | null | '?'),
      checkedAt: cases.checkedAt,
    },
    officialFacts: {
      domain: org.primaryDomain,
      rdap: known('ok'),
      registrationDate: known(of.registrationDate),
      registrar: known(of.registrar),
      nameservers: known(of.nameservers),
      mx: known(of.mx),
      addresses: known([]),
      asns: known(of.asns),
    },
  };
}
