import { describe, expect, it } from 'vitest';
import { parseVariant, similarity } from '../domain';
import { getOrg } from '../orgs';
import { known, UNKNOWN, type Facts } from '../rules';
import { officialFacts, variantFacts } from '../rules/test-facts';
import { lookupToCsv, toLookupExport } from './lookup';

const org = getOrg('tu-delft')!;
const exportedAt = new Date('2026-11-19T08:05:00Z');

/** tudelft.com registered 16 days before the check, no infrastructure shared with tudelft.nl. */
function youngTldSwap(): { variant: ReturnType<typeof parseVariant>; facts: Facts } {
  const variant = parseVariant('tudelft.com');
  return {
    variant,
    facts: {
      variantFacts: variantFacts({
        domain: 'tudelft.com',
        unicode: 'tudelft.com',
        tld: 'com',
        similarity: similarity(variant, 'tudelft', org.officialDomains),
        registrationDate: known('2026-11-01T00:00:00Z'),
        registrar: UNKNOWN,
      }),
      officialFacts: officialFacts(),
    },
  };
}

describe('toLookupExport', () => {
  it('describes a registered lookalike: org, variant, analysis, facts, verdict, why and every rule', () => {
    const { variant, facts } = youngTldSwap();
    const out = toLookupExport({ org, variant, facts, exportedAt });

    expect(out).toMatchObject({
      schemaVersion: 1,
      tool: 'izanami',
      kind: 'lookup',
      exportedAt: '2026-11-19T08:05:00.000Z',
      checkedAt: '2026-11-17T12:00:00Z',
      org: {
        slug: 'tu-delft',
        name: 'Delft University of Technology',
        primaryDomain: 'tudelft.nl',
        officialDomains: ['tudelft.nl'],
      },
      variant: {
        input: 'tudelft.com',
        unicode: 'tudelft.com',
        punycode: 'tudelft.com',
        registrableDomain: 'tudelft.com',
      },
      analysis: {
        technique: 'tld-swap',
        editDistance: 0,
        similarityPercent: 100,
        homoglyphs: [],
        inTrancoTop100k: false,
      },
      existence: 'resolving',
      registration: {
        registrationDate: '2026-11-01T00:00:00Z',
        registrar: null,
        firstCertDate: '2015-06-01T00:00:00Z',
      },
      dns: {
        nameservers: ['ns1.hostingprovider.nl', 'ns2.hostingprovider.nl'],
        mx: ['mx.hostingprovider.nl'],
        addresses: ['192.0.2.10'],
        spf: true,
      },
      hosting: { asns: [20857] },
      official: { domain: 'tudelft.nl', registrar: 'SURF B.V.', asns: [1128] },
    });
    expect(out.verdict?.label).toBe('Likely fraud');
    expect(out.rules).toHaveLength(14);
    expect(out.rules.find((r) => r.id === 'young-domain')).toMatchObject({
      status: 'fired',
      weight: 40,
    });
    expect(out.rules[0]).toEqual({
      id: 'official-match',
      status: 'not-fired',
      weight: expect.any(Number),
      summary: expect.any(String),
      explanation: expect.any(String),
    });
    const firedSum = out.rules
      .filter((r) => r.status === 'fired' && r.id !== 'official-match')
      .reduce((s, r) => s + r.weight, 0);
    expect(out.verdict?.score).toBe(firedSum);
    expect(out.why[0]).toMatchObject({ id: 'young-domain', kind: 'risk', weight: 40 });
  });

  it('lists homoglyph swaps with the character they imitate', () => {
    const variant = parseVariant('tudеlft.nl'); // Cyrillic е
    const { facts } = youngTldSwap();
    const out = toLookupExport({ org, variant, facts, exportedAt });
    expect(out.analysis.homoglyphs).toEqual([{ text: 'е', looksLike: 'e', codePoints: 'U+0435' }]);
    expect(out.variant.punycode).toMatch(/^xn--/);
  });

  it('gives an unregistered variant no verdict and no why, but keeps its rules', () => {
    const { variant, facts } = youngTldSwap();
    facts.variantFacts.existence = known('not-registered');
    const out = toLookupExport({ org, variant, facts, exportedAt });
    expect(out.existence).toBe('not-registered');
    expect(out.verdict).toBeNull();
    expect(out.why).toEqual([]);
    expect(out.rules).toHaveLength(14);
  });

  it('exports a known official domain without lookups: Official verdict, no facts or rules', () => {
    const variant = parseVariant('www.tudelft.nl');
    const out = toLookupExport({ org, variant, exportedAt });
    expect(out).toMatchObject({
      checkedAt: null,
      variant: { input: 'www.tudelft.nl', registrableDomain: 'tudelft.nl' },
      analysis: { technique: 'official', editDistance: 0 },
      existence: null,
      registration: null,
      dns: null,
      hosting: null,
      official: null,
      verdict: { label: 'Official', score: 0, unknownShare: 0 },
      why: [],
      rules: [],
    });
  });

  it('tells "no certificate ever logged" apart from "CT lookup failed"', () => {
    const { variant, facts } = youngTldSwap();
    facts.variantFacts.firstCertDate = known(null);
    expect(toLookupExport({ org, variant, facts, exportedAt }).registration?.firstCertDate).toBe(
      'none',
    );
    facts.variantFacts.firstCertDate = UNKNOWN;
    expect(
      toLookupExport({ org, variant, facts, exportedAt }).registration?.firstCertDate,
    ).toBeNull();
  });

  it('survives a JSON round trip unchanged', () => {
    const { variant, facts } = youngTldSwap();
    const out = toLookupExport({ org, variant, facts, exportedAt });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('lookupToCsv', () => {
  it('writes one row per rule, each repeating the domain and verdict columns', () => {
    const { variant, facts } = youngTldSwap();
    const csv = lookupToCsv(toLookupExport({ org, variant, facts, exportedAt }));
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'domain,unicode,org,existence,verdict,score,unknown_share,checked_at,' +
        'rule_id,rule_status,rule_weight,rule_summary,rule_explanation',
    );
    expect(lines).toHaveLength(15);
    expect(lines.find((l) => l.includes(',young-domain,'))).toMatch(
      /^tudelft\.com,tudelft\.com,Delft University of Technology,resolving,Likely fraud,\d+,[\d.]+,2026-11-17T12:00:00Z,young-domain,fired,40,/,
    );
  });

  it('writes a single row with empty rule columns for an official domain', () => {
    const csv = lookupToCsv(
      toLookupExport({ org, variant: parseVariant('tudelft.nl'), exportedAt }),
    );
    expect(csv.trimEnd().split('\r\n')[1]).toBe(
      'tudelft.nl,tudelft.nl,Delft University of Technology,,Official,0,0,,,,,,',
    );
  });
});
