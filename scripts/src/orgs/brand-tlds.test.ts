import { describe, expect, it } from 'vitest';
import {
  assignBrandTlds,
  parseBrandTldsConfig,
  parseRootZoneDb,
  parseSpecification13,
} from './brand-tlds';
import type { Org } from './select';

/** Two rows in the shape of https://www.iana.org/domains/root/db (trimmed). */
function row(tld: string, status: string, type: string, manager: string): string {
  return `<tr>
    <td><a href="/domains/root/db/${tld}"> .${tld} <span class="rz-icon-sm"><img src="x.svg" alt=""></span></a></td>
    <td><span class="index-label"><span class="rz-icon-sm"><img alt=""></span> ${status} </span></td>
    <td><span class="index-label"> ${type} </span></td>
    <td class="col-manager">
        ${manager}
    </td>
    <td>Latn</td><td>Latin</td><td>en||${tld}</td>
  </tr>`;
}

const ROOT_ZONE = `<table id="ddtable"><thead><tr><th>TLD</th><th>Status</th></tr></thead><tbody>
${row('gle', 'Active', 'Generic', 'Charleston Road Registry Inc.')}
${row('google', 'Active', 'Generic', 'Charleston Road Registry Inc.')}
${row('xn--flw351e', 'Active', 'Generic', 'Charleston Road Registry Inc.')}
${row('app', 'Active', 'Generic', 'Charleston Road Registry Inc.')}
${row('apple', 'Active', 'Generic', 'Apple Inc.')}
${row('ac', 'Eligible', 'Country Code', 'Charleston Road Registry Inc.')}
</tbody></table>`;

describe('parseRootZoneDb', () => {
  it('reads each delegated TLD (punycode), its type and its manager', () => {
    expect(parseRootZoneDb(ROOT_ZONE)).toEqual([
      { tld: 'gle', type: 'Generic', manager: 'Charleston Road Registry Inc.' },
      { tld: 'google', type: 'Generic', manager: 'Charleston Road Registry Inc.' },
      { tld: 'xn--flw351e', type: 'Generic', manager: 'Charleston Road Registry Inc.' },
      { tld: 'app', type: 'Generic', manager: 'Charleston Road Registry Inc.' },
      { tld: 'apple', type: 'Generic', manager: 'Apple Inc.' },
    ]);
  });
});

describe('parseSpecification13', () => {
  it('returns the .brand TLDs (Specification 13) with a live registry agreement', () => {
    const json = {
      gTLDs: [
        { gTLD: 'google', specification13: true, contractTerminated: false, removalDate: null },
        { gTLD: 'app', specification13: false, contractTerminated: false, removalDate: null },
        { gTLD: 'abarth', specification13: null, contractTerminated: true, removalDate: '2023' },
        { gTLD: 'old', specification13: true, contractTerminated: true, removalDate: null },
      ],
    };
    expect([...parseSpecification13(json)]).toEqual(['google']);
  });
});

const CONFIG = [
  {
    operator: 'Charleston Road Registry Inc.',
    wikidataId: 'Q95',
    source: 'https://www.iana.org/domains/root/db/google.html',
    closedTlds: [{ tld: 'gle', source: 'https://www.iana.org/domains/root/db/gle.html' }],
  },
  {
    operator: 'Apple Inc.',
    wikidataId: 'Q312',
    source: 'https://www.iana.org/domains/root/db/apple.html',
  },
];

describe('parseBrandTldsConfig', () => {
  it('accepts operator → org entries, each with a source URL', () => {
    expect(parseBrandTldsConfig(CONFIG)).toEqual(CONFIG);
  });

  it('rejects an entry without a source URL', () => {
    expect(() => parseBrandTldsConfig([{ operator: 'Apple Inc.', wikidataId: 'Q312' }])).toThrow(
      /source/,
    );
  });

  it('rejects a closed TLD without a source URL', () => {
    expect(() => parseBrandTldsConfig([{ ...CONFIG[0], closedTlds: [{ tld: 'gle' }] }])).toThrow(
      /source/,
    );
  });
});

const org = (wikidataId: string, name: string): Org => ({
  slug: name.toLowerCase(),
  name,
  wikidataId,
  country: 'US',
  primaryDomain: `${name.toLowerCase()}.com`,
  officialDomains: [`${name.toLowerCase()}.com`],
  relatedDomains: [],
  brandTlds: [],
  wikidataDomain: `${name.toLowerCase()}.com`,
  trancoRank: 1,
  confirmedAt: '2026-11-19',
});

describe('assignBrandTlds', () => {
  const orgs = [org('Q95', 'Google'), org('Q312', 'Apple'), org('Q1', 'Other')];
  const inputs = {
    rootZone: parseRootZoneDb(ROOT_ZONE),
    specification13: new Set(['google', 'xn--flw351e', 'apple']),
    operators: parseBrandTldsConfig(CONFIG),
  };

  it('gives each org the .brand and curated closed TLDs its operator runs, never open ones', () => {
    const { orgs: result } = assignBrandTlds(orgs, inputs);
    expect(result.map((o) => [o.slug, o.brandTlds])).toEqual([
      ['google', ['gle', 'google', 'xn--flw351e']],
      ['apple', ['apple']],
      ['other', []],
    ]);
  });

  it('notes an operator IANA lists for no TLD (a misspelt manager name)', () => {
    const operators = parseBrandTldsConfig([{ ...CONFIG[1], operator: 'Apple, Inc.' }]);
    const { notes } = assignBrandTlds(orgs, { ...inputs, operators });
    expect(notes).toEqual([
      'Brand-TLD operator "Apple, Inc." manages no generic TLD in the IANA Root Zone Database.',
    ]);
  });

  it('notes a curated closed TLD that IANA does not list under the operator', () => {
    const operators = parseBrandTldsConfig([
      {
        ...CONFIG[1],
        closedTlds: [{ tld: 'gle', source: 'https://www.iana.org/domains/root/db/gle.html' }],
      },
    ]);
    const { orgs: result, notes } = assignBrandTlds(orgs, { ...inputs, operators });
    expect(result[1]?.brandTlds).toEqual(['apple']);
    expect(notes).toEqual([
      'Brand TLD .gle is curated for Apple Inc. but IANA lists Charleston Road Registry Inc. as its manager; skipped.',
    ]);
  });

  it('also gives a shared TLD to the owned orgs listed for it (R4), each with a source', () => {
    const operators = parseBrandTldsConfig([
      {
        ...CONFIG[0],
        sharedTlds: [
          {
            tld: 'google',
            wikidataId: 'Q1',
            source: 'https://www.iana.org/domains/root/db/google.html',
          },
        ],
      },
    ]);
    const { orgs: result, notes } = assignBrandTlds(orgs, { ...inputs, operators });
    expect(result.map((o) => [o.slug, o.brandTlds])).toEqual([
      ['google', ['gle', 'google', 'xn--flw351e']],
      ['apple', []],
      ['other', ['google']],
    ]);
    expect(notes).toEqual([]);
  });

  it("notes a shared TLD that is not one of the operator's brand TLDs", () => {
    const operators = parseBrandTldsConfig([
      {
        ...CONFIG[0],
        sharedTlds: [
          { tld: 'apple', wikidataId: 'Q1', source: 'https://www.iana.org/domains/root/db/apple.html' },
        ],
      },
    ]);
    const { orgs: result, notes } = assignBrandTlds(orgs, { ...inputs, operators });
    expect(result[2]?.brandTlds).toEqual([]);
    expect(notes).toEqual([
      'Brand TLD .apple is shared from Charleston Road Registry Inc. but is not one of its brand TLDs; skipped.',
    ]);
  });

  it('rejects a shared TLD without a source URL', () => {
    expect(() =>
      parseBrandTldsConfig([{ ...CONFIG[0], sharedTlds: [{ tld: 'google', wikidataId: 'Q1' }] }]),
    ).toThrow(/source/);
  });
});
