import { describe, expect, it } from 'vitest';
import { getOrg } from '../orgs';
import type { ScanRow } from '../scan';
import { scanToCsv, toScanExport } from './scan';

const org = getOrg('tu-delft')!;
const exportedAt = new Date('2026-11-19T08:05:00Z');

const rows: ScanRow[] = [
  {
    candidate: { domain: 'tudelft.com', display: 'tudelft.com', technique: 'tld-swap', tld: 'com' },
    exists: 'yes',
    nameservers: ['ns1.example.net'],
    rating: { tld: 'com', category: 'generic', label: 'generic' },
    checkedAt: '2026-11-19T08:00:01.000Z',
  },
  {
    candidate: {
      domain: 'xn--tudlft-3ve.nl',
      display: 'tudеlft.nl',
      technique: 'homoglyph',
      tld: 'nl',
    },
    exists: 'no',
    nameservers: [],
    rating: {
      tld: 'nl',
      category: 'country',
      label: 'country · Netherlands',
      country: 'Netherlands',
    },
    checkedAt: '2026-11-19T08:00:02.000Z',
  },
];

describe('toScanExport', () => {
  it('lists every checked candidate with technique, TLD rating, existence and check time', () => {
    const out = toScanExport({ org, state: { phase: 'done', total: 2, rows }, exportedAt });
    expect(out).toEqual({
      schemaVersion: 1,
      tool: 'izanami',
      kind: 'lookalike-scan',
      exportedAt: '2026-11-19T08:05:00.000Z',
      org: {
        slug: 'tu-delft',
        name: 'Delft University of Technology',
        primaryDomain: 'tudelft.nl',
        officialDomains: ['tudelft.nl'],
        relatedDomains: [
          { domain: 'tudelft.com', source: 'curated', url: 'https://crt.sh/?id=28188220425' },
          { domain: 'tudelft.eu', source: 'curated', url: 'https://crt.sh/?id=29352240987' },
        ],
        brandTlds: [],
      },
      scan: { status: 'done', total: 2, checked: 2, registered: 1 },
      candidates: [
        {
          domain: 'tudelft.com',
          display: 'tudelft.com',
          technique: 'tld-swap',
          techniqueLabel: 'TLD swap',
          tld: 'com',
          tldRating: 'generic',
          tldCategory: 'generic',
          exists: 'yes',
          nameservers: ['ns1.example.net'],
          checkedAt: '2026-11-19T08:00:01.000Z',
        },
        {
          domain: 'xn--tudlft-3ve.nl',
          display: 'tudеlft.nl',
          technique: 'homoglyph',
          techniqueLabel: 'Homoglyph',
          tld: 'nl',
          tldRating: 'country · Netherlands',
          tldCategory: 'country',
          exists: 'no',
          nameservers: [],
          checkedAt: '2026-11-19T08:00:02.000Z',
        },
      ],
    });
  });

  it('marks a cancelled scan as partial: checked < total', () => {
    const out = toScanExport({
      org,
      state: { phase: 'cancelled', total: 150, rows: rows.slice(0, 1) },
      exportedAt,
    });
    expect(out.scan).toEqual({ status: 'cancelled', total: 150, checked: 1, registered: 1 });
  });
});

describe('scanToCsv', () => {
  it('writes one row per candidate', () => {
    const csv = scanToCsv(
      toScanExport({ org, state: { phase: 'done', total: 2, rows }, exportedAt }),
    );
    expect(csv).toBe(
      'candidate,domain,technique,tld,tld_rating,exists,checked_at\r\n' +
        'tudelft.com,tudelft.com,tld-swap,com,generic,yes,2026-11-19T08:00:01.000Z\r\n' +
        'tudеlft.nl,xn--tudlft-3ve.nl,homoglyph,nl,country · Netherlands,no,2026-11-19T08:00:02.000Z\r\n',
    );
  });
});
