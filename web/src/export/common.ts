import { exportSources, type ExportSource, type SourceId } from '../credits/sources';
import type { Org, RelatedDomain } from '../orgs';

export type { ExportSource } from '../credits/sources';

/** Bumped on any breaking change to an export document's shape. */
export const EXPORT_SCHEMA_VERSION = 1;

export interface ExportOrg {
  slug: string;
  name: string;
  primaryDomain: string;
  officialDomains: string[];
  /** Related official domains (ticket 15); additive, so the schema version is unchanged. */
  relatedDomains: RelatedDomain[];
  /** TLDs the org operates (ticket 14, punycode); additive, so the schema version is unchanged. */
  brandTlds: string[];
}

export const exportOrg = (org: Org): ExportOrg => ({
  slug: org.slug,
  name: org.name,
  primaryDomain: org.primaryDomain,
  officialDomains: [...org.officialDomains],
  relatedDomains: org.relatedDomains.map((r) => ({ ...r })),
  brandTlds: [...org.brandTlds],
});

/** Sources whose data a lookup export carries (ticket 17); additive, so the schema version is unchanged. */
const LOOKUP_SOURCE_IDS: readonly SourceId[] = [
  'wikidata',
  'majestic-million',
  'chrome-ux-report',
  'public-suffix-list',
  'unicode-confusables',
  'cloudflare-doh',
  'google-public-dns',
  'team-cymru',
  'registry-rdap',
  'rdap-org',
  'crt-sh',
];

/** Sources whose data a lookalike-scan export carries. */
const SCAN_SOURCE_IDS: readonly SourceId[] = [
  'wikidata',
  'public-suffix-list',
  'iana-root-zone',
  'icann-gtlds',
  'cloudflare-doh',
  'google-public-dns',
];

export const lookupSources = (): ExportSource[] => exportSources(LOOKUP_SOURCE_IDS);
export const scanSources = (): ExportSource[] => exportSources(SCAN_SOURCE_IDS);
