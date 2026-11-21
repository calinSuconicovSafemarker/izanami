import { describe, expect, it } from 'vitest';
import { allOrgs, getOrg } from '../orgs';
import { DOMAINS_CSV_HEADER, domainRows, domainsToCsv } from './domains';

const col = (name: (typeof DOMAINS_CSV_HEADER)[number]) => DOMAINS_CSV_HEADER.indexOf(name);
const rowsFor = (slug: string) => domainRows([getOrg(slug)!]);

describe('all-domains CSV', () => {
  it('covers every organisation, with each org + domain once', () => {
    const rows = domainRows(allOrgs);
    expect(new Set(rows.map((r) => r[col('org_id')])).size).toBe(allOrgs.length);
    const keys = rows.map((r) => `${r[col('org_id')]}|${r[col('domain')]}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows.every((r) => r.length === DOMAINS_CSV_HEADER.length)).toBe(true);
  });

  it('marks own sites, published and curated domains and brand TLDs official', () => {
    const google = rowsFor('google');
    const trust = (domain: string) =>
      google.find((r) => r[col('domain')] === domain)?.[col('trust')];
    expect(trust('google.com')).toBe('official');
    expect(trust('g.co')).toBe('official');
    expect(trust('youtube.com')).toBe('official');
    expect(trust('*.google')).toBe('official');
    expect(google.find((r) => r[col('domain')] === 'google.com')?.[col('relationship')]).toBe(
      'primary domain',
    );
  });

  it('marks Wikidata-owned domains verify, with the owned entity as evidence', () => {
    const owned = rowsFor('paypal').filter((r) => r[col('relationship')] === 'owned per Wikidata');
    expect(owned.length).toBeGreaterThan(0);
    for (const r of owned) {
      expect(r[col('trust')]).toBe('verify');
      expect(r[col('evidence')]).toMatch(/wikidata\.org\/wiki\/Q\d+/);
    }
  });

  it('writes a header line and one CRLF line per row', () => {
    const csv = domainsToCsv([getOrg('tu-delft')!]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(DOMAINS_CSV_HEADER.join(','));
    expect(lines).toHaveLength(rowsFor('tu-delft').length + 1);
    expect(lines[1]).toContain('tudelft.nl,primary domain,official');
  });
});
