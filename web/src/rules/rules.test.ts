import { describe, expect, it } from 'vitest';
import { RULES } from './rules';
import { officialFacts, variantFacts } from './test-facts';
import type { OfficialFacts, RuleId, RuleStatus, VariantFacts } from './types';
import { isNotRegistered, known, PENDING, UNKNOWN } from './types';

interface Row {
  name: string;
  variant?: Partial<VariantFacts>;
  official?: Partial<OfficialFacts>;
  status: RuleStatus;
  weight?: number;
  /** Substrings the explanation must contain. */
  says?: string[];
}

function table(id: RuleId, rows: Row[]) {
  describe(id, () => {
    it.each(rows)('$name → $status', (row) => {
      const result = RULES[id](variantFacts(row.variant), officialFacts(row.official));
      expect(result.id).toBe(id);
      expect(result.status).toBe(row.status);
      if (row.weight !== undefined) expect(result.weight).toBe(row.weight);
      for (const s of row.says ?? []) expect(result.explanation).toContain(s);
      expect(result.explanation.length).toBeGreaterThan(10);
    });
  });
}

table('young-domain', [
  {
    name: 'registered 12 days ago',
    variant: { registrationDate: known('2026-11-05T12:00:00Z') },
    status: 'fired',
    weight: 40,
    says: ['12 days ago', 'tudelft.nl', '1987'],
  },
  {
    name: 'registered 2010',
    variant: { registrationDate: known('2010-01-01T00:00:00Z') },
    status: 'not-fired',
    weight: 40,
    says: ['2010'],
  },
  {
    name: 'registration date unavailable',
    variant: { registrationDate: UNKNOWN },
    status: 'unknown',
  },
  { name: 'still pending', variant: { registrationDate: PENDING }, status: 'unknown' },
  {
    name: 'not registered',
    variant: { existence: known('not-registered'), registrationDate: UNKNOWN },
    status: 'not-fired',
  },
]);

table('much-newer', [
  {
    name: '2010 vs 1987',
    variant: { registrationDate: known('2010-01-01T00:00:00Z') },
    status: 'fired',
    weight: 15,
    says: ['2010', '1987', '22 years'],
  },
  {
    name: '1990 vs 1987',
    variant: { registrationDate: known('1990-01-01T00:00:00Z') },
    status: 'not-fired',
    says: ['1990'],
  },
  {
    name: 'young-domain covers it',
    variant: { registrationDate: known('2026-11-05T12:00:00Z') },
    status: 'not-fired',
    says: ['young-domain'],
  },
  { name: 'variant date unknown', variant: { registrationDate: UNKNOWN }, status: 'unknown' },
  { name: 'official date unknown', official: { registrationDate: UNKNOWN }, status: 'unknown' },
  {
    name: 'not registered',
    variant: { existence: known('not-registered'), registrationDate: UNKNOWN },
    status: 'not-fired',
  },
]);

const sim = (
  kind: VariantFacts['similarity']['kind'],
  extra: Partial<VariantFacts['similarity']> = {},
) => ({
  similarity: {
    isOfficial: kind === 'official',
    editDistance: 1,
    homoglyph: kind === 'homoglyph',
    containsBrand: kind === 'combo',
    tldSwap: kind === 'tld-swap',
    kind,
    ...extra,
  },
});

table('brand-lookalike', [
  {
    name: 'typo',
    variant: { ...sim('typo'), unicode: 'tudeltf.nl' },
    status: 'fired',
    weight: 25,
    says: ['tudeltf.nl', 'tudelft', '1'],
  },
  {
    name: 'combo',
    variant: { ...sim('combo'), unicode: 'tudelft-login.nl' },
    status: 'fired',
    weight: 25,
    says: ['contains', 'tudelft'],
  },
  {
    name: 'tld swap',
    variant: { ...sim('tld-swap', { editDistance: 0 }), unicode: 'tudelft.com' },
    status: 'fired',
    weight: 25,
  },
  {
    name: 'subdomain trick',
    variant: { ...sim('subdomain-trick'), unicode: 'evil.com' },
    status: 'fired',
    weight: 25,
  },
  {
    name: 'homoglyph',
    variant: { ...sim('homoglyph'), unicode: 'tud\u0435lft.nl' },
    status: 'fired',
    weight: 35,
    says: ['look-alike characters'],
  },
  {
    name: 'unrelated',
    variant: sim('unrelated', { editDistance: 9 }),
    status: 'not-applicable',
    says: ['not a lookalike', 'Delft University of Technology'],
  },
]);

table('not-in-tranco', [
  {
    name: 'absent',
    variant: { inTranco: false },
    status: 'fired',
    weight: 10,
    says: ['example-unrelated.nl', 'Tranco'],
  },
  { name: 'present', variant: { inTranco: true }, status: 'not-fired', says: ['Tranco'] },
]);

table('listed-related', [
  {
    name: 'listed by Wikidata as owned via a subsidiary',
    variant: { listedRelated: { via: 'Jaiku' } },
    status: 'fired',
    weight: -30,
    says: ['Wikidata', 'Delft University of Technology', 'Jaiku'],
  },
  { name: 'not listed', status: 'not-fired', weight: -30 },
]);

describe('listed-related summary', () => {
  it('names the organisation and the owned entity', () => {
    const r = RULES['listed-related'](
      variantFacts({ orgName: 'Google', listedRelated: { via: 'YouTube' } }),
      officialFacts(),
    );
    expect(r.summary).toBe('Listed by Wikidata as owned by Google (via YouTube)');
  });

  it('leaves out "via" when the entity is the organisation itself', () => {
    const r = RULES['listed-related'](
      variantFacts({ orgName: 'Google', listedRelated: { via: 'Google' } }),
      officialFacts(),
    );
    expect(r.summary).toBe('Listed by Wikidata as owned by Google');
  });
});

table('odd-tld', [
  {
    name: 'abuse-heavy .xyz',
    variant: { tld: 'xyz', domain: 'tudelft.xyz' },
    status: 'fired',
    weight: 10,
    says: ['.xyz'],
  },
  { name: 'country ccTLD', variant: { tld: 'nl' }, status: 'not-fired', says: ['.nl'] },
  { name: 'common gTLD', variant: { tld: 'com' }, status: 'not-fired' },
  { name: 'other TLD not on abuse list', variant: { tld: 'de' }, status: 'not-fired' },
  { name: 'multi-label suffix', variant: { tld: 'co.uk' }, status: 'not-fired' },
  {
    name: 'abuse-heavy but is the org ccTLD',
    variant: { tld: 'tk', orgCountry: 'TK' },
    status: 'not-fired',
  },
]);

table('official-match', [
  {
    name: 'official domain',
    variant: sim('official', { editDistance: 0 }),
    status: 'fired',
    weight: 0,
    says: ['official'],
  },
  {
    name: 'under a brand TLD the org operates',
    variant: {
      ...sim('official', { brandTld: 'gle' }),
      unicode: 'c.gle',
      tld: 'gle',
      orgName: 'Google',
    },
    status: 'fired',
    weight: 0,
    says: ['Google operates the .gle top-level domain'],
  },
  { name: 'lookalike', variant: sim('typo'), status: 'not-fired', weight: 0 },
]);

table('same-nameservers', [
  {
    name: 'same NS host',
    variant: { nameservers: known(['ns1.surfnet.nl', 'ns9.other.net']) },
    status: 'fired',
    weight: -40,
    says: ['ns1.surfnet.nl'],
  },
  {
    name: 'same NS provider, different host',
    variant: { nameservers: known(['ns3.surfnet.nl']) },
    status: 'fired',
    says: ['surfnet.nl'],
  },
  {
    name: 'different provider',
    variant: { nameservers: known(['ns1.sedoparking.com']) },
    status: 'not-fired',
    says: ['ns1.sedoparking.com'],
  },
  { name: 'variant has no NS', variant: { nameservers: known([]) }, status: 'not-fired' },
  { name: 'variant NS unknown', variant: { nameservers: UNKNOWN }, status: 'unknown' },
  { name: 'official NS unknown', official: { nameservers: PENDING }, status: 'unknown' },
]);

table('same-registrar', [
  {
    name: 'same registrar, normalised',
    variant: { registrar: known('surf b.v') },
    status: 'fired',
    weight: -25,
    says: ['SURF B.V.'],
  },
  {
    name: 'same brand registrar',
    variant: { registrar: known('MarkMonitor Inc.') },
    official: { registrar: known('MarkMonitor, Inc.') },
    status: 'fired',
    weight: -35,
    says: ['brand-protection'],
  },
  {
    name: 'different registrar',
    variant: { registrar: known('NameCheap, Inc.') },
    status: 'not-fired',
    weight: -25,
    says: ['NameCheap, Inc.', 'SURF B.V.'],
  },
  {
    name: 'not registered',
    variant: { existence: known('not-registered'), registrar: UNKNOWN },
    status: 'not-fired',
  },
  {
    name: 'same registrar under its d/b/a trade name',
    variant: { registrar: known('Hosting Concepts B.V. d/b/a Registrar.eu') },
    official: { registrar: known('Registrar.eu') },
    status: 'fired',
  },
  {
    name: 'registrar operating its own .nl domain (SIDN lists TU Delft itself)',
    variant: { registrar: known('Technische Universiteit Delft') },
    official: { registrar: known('Technische Universiteit Delft') },
    status: 'fired',
  },
  { name: 'variant registrar unknown', variant: { registrar: UNKNOWN }, status: 'unknown' },
  { name: 'official registrar unknown', official: { registrar: UNKNOWN }, status: 'unknown' },
]);

table('same-mx', [
  {
    name: 'same MX provider',
    variant: { mx: known(['tudelft-login-nl.mail.protection.outlook.com']) },
    status: 'fired',
    weight: -15,
    says: ['outlook.com'],
  },
  {
    name: 'different MX provider',
    variant: { mx: known(['mx1.privateemail.com']) },
    status: 'not-fired',
    says: ['privateemail.com'],
  },
  { name: 'variant has no MX', variant: { mx: known([]) }, status: 'not-fired' },
  { name: 'variant MX unknown', variant: { mx: UNKNOWN }, status: 'unknown' },
  { name: 'official MX unknown', official: { mx: UNKNOWN }, status: 'unknown' },
]);

table('same-asn', [
  {
    name: 'same ASN',
    variant: { asns: known([1128]) },
    status: 'fired',
    weight: -15,
    says: ['AS1128'],
  },
  {
    name: 'different ASN',
    variant: { asns: known([13335]) },
    status: 'not-fired',
    says: ['AS13335', 'AS1128'],
  },
  { name: 'variant has no addresses', variant: { asns: known([]) }, status: 'not-fired' },
  { name: 'variant ASN unknown', variant: { asns: UNKNOWN }, status: 'unknown' },
  { name: 'official ASN unknown', official: { asns: UNKNOWN }, status: 'unknown' },
]);

const noShared: Partial<VariantFacts> = {};
const notResolving: Partial<VariantFacts> = {
  existence: known('registered-not-resolving'),
  nameservers: known(['ns1.hostingprovider.nl']),
  mx: known([]),
  spf: known(false),
  asns: known([]),
};

table('no-mx', [
  {
    name: 'resolves, no MX, no SPF',
    variant: { mx: known([]), spf: known(false) },
    status: 'fired',
    weight: 10,
    says: ['no MX', 'SPF'],
  },
  { name: 'has MX', variant: { mx: known(['mx.x.nl']), spf: known(false) }, status: 'not-fired' },
  { name: 'has SPF only', variant: { mx: known([]), spf: known(true) }, status: 'not-fired' },
  { name: 'not resolving', variant: notResolving, status: 'not-fired' },
  { name: 'MX unknown', variant: { mx: UNKNOWN, spf: known(false) }, status: 'unknown' },
  { name: 'SPF unknown', variant: { mx: known([]), spf: UNKNOWN }, status: 'unknown' },
  { name: 'existence unknown', variant: { existence: UNKNOWN }, status: 'unknown' },
  {
    name: 'no MX/SPF but shares nameservers (parked defensive registration)',
    variant: { mx: known([]), spf: known(false), nameservers: known(['ns1.surfnet.nl']) },
    status: 'not-fired',
    says: ['shares nameservers', 'tudelft.nl'],
  },
  {
    name: 'no MX/SPF but same registrar',
    variant: { mx: known([]), spf: known(false), registrar: known('SURF BV') },
    status: 'not-fired',
    says: ['shares the registrar'],
  },
  {
    name: 'MX unknown but shares nameservers',
    variant: { mx: UNKNOWN, spf: known(false), nameservers: known(['ns1.surfnet.nl']) },
    status: 'not-fired',
  },
]);

table('mail-ready', [
  {
    name: 'MX + SPF, no shared infra',
    variant: noShared,
    status: 'fired',
    weight: 15,
    says: ['mx.hostingprovider.nl', 'SPF'],
  },
  {
    name: 'MX + SPF but shares nameservers',
    variant: { nameservers: known(['ns1.surfnet.nl']) },
    status: 'not-fired',
    says: ['shares'],
  },
  { name: 'no SPF', variant: { spf: known(false) }, status: 'not-fired' },
  { name: 'no MX', variant: { mx: known([]) }, status: 'not-fired' },
  { name: 'not resolving', variant: notResolving, status: 'not-fired' },
  { name: 'SPF unknown', variant: { spf: UNKNOWN }, status: 'unknown' },
  {
    name: 'MX + SPF, overlap partly unknown',
    variant: { asns: UNKNOWN },
    status: 'unknown',
  },
]);

table('fresh-cert', [
  {
    name: 'first cert 5 days ago',
    variant: { firstCertDate: known('2026-11-12T12:00:00Z') },
    status: 'fired',
    weight: 20,
    says: ['5 days ago'],
  },
  {
    name: 'first cert 2015',
    variant: { firstCertDate: known('2015-06-01T00:00:00Z') },
    status: 'not-fired',
    says: ['2015'],
  },
  {
    name: 'no certificate ever',
    variant: { firstCertDate: known(null) },
    status: 'not-fired',
    says: ['No certificate'],
  },
  { name: 'crt.sh unavailable', variant: { firstCertDate: UNKNOWN }, status: 'unknown' },
]);

table('registered-not-resolving', [
  {
    name: 'registered, not resolving',
    variant: notResolving,
    status: 'fired',
    weight: 20,
    says: ['worth watching'],
  },
  { name: 'resolving', status: 'not-fired' },
  { name: 'not registered', variant: { existence: known('not-registered') }, status: 'not-fired' },
  { name: 'existence unknown', variant: { existence: UNKNOWN }, status: 'unknown' },
]);

describe('RULES', () => {
  it('has a rule for every id in the SPEC table', () => {
    expect(Object.keys(RULES).sort()).toEqual(
      [
        'official-match',
        'listed-related',
        'young-domain',
        'much-newer',
        'brand-lookalike',
        'not-in-tranco',
        'same-nameservers',
        'same-registrar',
        'same-mx',
        'same-asn',
        'no-mx',
        'mail-ready',
        'fresh-cert',
        'registered-not-resolving',
        'odd-tld',
      ].sort(),
    );
  });
});

describe('isNotRegistered', () => {
  it('is true only for a known not-registered existence', () => {
    expect(isNotRegistered(known('not-registered'))).toBe(true);
    expect(isNotRegistered(known('resolving'))).toBe(false);
    expect(isNotRegistered(UNKNOWN)).toBe(false);
    expect(isNotRegistered(PENDING)).toBe(false);
  });
});
