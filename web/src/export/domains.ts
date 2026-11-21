import { officialContext, type Org } from '../orgs';
import { toCsv } from './csv';

/**
 * Every organisation's legitimate domains, one row per organisation + domain. Used by the
 * "Download all domains" button and by `GET /api/domains.csv`, so both give the same file.
 * Trust levels follow the site's one definition of "official" (`officialContext`, R1/S2).
 */
export const DOMAINS_CSV_HEADER = [
  'organisation',
  'org_id',
  'wikidata_id',
  'country',
  'primary_domain',
  'domain',
  'relationship',
  'trust',
  'evidence',
] as const;

export type DomainTrust = 'official' | 'verify';

const RELATED_LABEL = {
  'published-list': 'published by the company',
  curated: 'curated (with source)',
  'wikidata-owned': 'owned per Wikidata',
} as const;

export function domainRows(orgs: readonly Org[]): string[][] {
  const rows: string[][] = [];
  for (const org of orgs) {
    const base = [org.name, org.slug, org.wikidataId, org.country ?? '', org.primaryDomain];
    // Own sites are Wikidata's "official website" (P856) entries, or a curated entry.
    const ownEvidence =
      org.wikidataDomain === null
        ? 'curated entry'
        : `Wikidata ${org.wikidataId} official website (P856)`;
    for (const domain of org.officialDomains) {
      const relationship = domain === org.primaryDomain ? 'primary domain' : 'own site';
      rows.push([...base, domain, relationship, 'official', ownEvidence]);
    }
    for (const r of org.relatedDomains) {
      const trust: DomainTrust = r.source === 'wikidata-owned' ? 'verify' : 'official';
      const evidence = [r.via, r.url].filter(Boolean).join(' — ');
      rows.push([...base, r.domain, RELATED_LABEL[r.source], trust, evidence]);
    }
    for (const tld of officialContext(org).brandTlds) {
      rows.push([
        ...base,
        `*.${tld}`,
        'brand TLD (every domain under it)',
        'official',
        'IANA root zone database / ICANN .brand list',
      ]);
    }
  }
  return rows;
}

export const domainsToCsv = (orgs: readonly Org[]): string =>
  toCsv(DOMAINS_CSV_HEADER, domainRows(orgs));
