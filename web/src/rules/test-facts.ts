// Test-only builders for hand-made facts. A neutral baseline: an unrelated,
// established, resolving domain with no infrastructure overlap.
import type { OfficialFacts, VariantFacts } from './types';
import { known } from './types';

export const CHECKED_AT = '2026-11-17T12:00:00Z';

export function officialFacts(overrides: Partial<OfficialFacts> = {}): OfficialFacts {
  return {
    domain: 'tudelft.nl',
    rdap: known('ok'),
    registrationDate: known('1987-03-17T00:00:00Z'),
    registrar: known('SURF B.V.'),
    nameservers: known(['ns1.surfnet.nl', 'ns2.surfnet.nl', 'ns1.zurich.surf.net']),
    mx: known(['tudelft-nl.mail.protection.outlook.com']),
    addresses: known(['130.161.128.82']),
    asns: known([1128]),
    ...overrides,
  };
}

export function variantFacts(overrides: Partial<VariantFacts> = {}): VariantFacts {
  return {
    domain: 'example-unrelated.nl',
    unicode: 'example-unrelated.nl',
    tld: 'nl',
    brandLabel: 'tudelft',
    orgName: 'Delft University of Technology',
    orgCountry: 'NL',
    similarity: {
      isOfficial: false,
      editDistance: 15,
      homoglyph: false,
      containsBrand: false,
      tldSwap: false,
      kind: 'unrelated',
    },
    inTranco: false,
    existence: known('resolving'),
    rdap: known('ok'),
    registrationDate: known('2010-01-01T00:00:00Z'),
    registrar: known('Hosting Provider B.V.'),
    nameservers: known(['ns1.hostingprovider.nl', 'ns2.hostingprovider.nl']),
    mx: known(['mx.hostingprovider.nl']),
    spf: known(true),
    addresses: known(['192.0.2.10']),
    asns: known([20857]),
    firstCertDate: known('2015-06-01T00:00:00Z'),
    checkedAt: CHECKED_AT,
    ...overrides,
  };
}
