import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { isAwaitingLookup, unknownSources } from './inputs';
import { officialFacts, variantFacts } from './test-facts';
import { PENDING, UNKNOWN } from './types';

describe('isAwaitingLookup', () => {
  it('flags unknown rules whose variant or official inputs are still pending', () => {
    const facts = {
      variantFacts: variantFacts({ firstCertDate: PENDING }),
      officialFacts: officialFacts({ asns: PENDING }),
    };
    const awaiting = evaluate(facts)
      .filter((r) => isAwaitingLookup(r, facts))
      .map((r) => r.id);
    expect(awaiting).toEqual(['same-asn', 'mail-ready', 'fresh-cert']);
  });

  it('does not flag rules whose inputs failed rather than pending', () => {
    const facts = {
      variantFacts: variantFacts({ firstCertDate: UNKNOWN }),
      officialFacts: officialFacts(),
    };
    expect(evaluate(facts).some((r) => isAwaitingLookup(r, facts))).toBe(false);
  });
});

describe('unknownSources', () => {
  it('names each failed lookup source once', () => {
    expect(unknownSources(variantFacts({ mx: UNKNOWN, spf: UNKNOWN, registrar: UNKNOWN }))).toEqual(
      ['DNS', 'RDAP'],
    );
    expect(unknownSources(officialFacts({ asns: UNKNOWN }))).toEqual(['ASN']);
  });
});
