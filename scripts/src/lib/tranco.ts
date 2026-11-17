import { registrableDomain } from './domain';
import { cachedDownload } from './net';
import { unzipFirstFile } from './zip';

export const TRANCO_URL = 'https://tranco-list.eu/top-1m.csv.zip';

/** The Tranco top-1M `rank,domain` CSV, downloaded once into the shared cache. */
export async function trancoCsv(
  fetchBytes: (url: string) => Promise<Uint8Array> = cachedDownload,
): Promise<string> {
  return unzipFirstFile(await fetchBytes(TRANCO_URL)).toString('utf8');
}

/** The first `n` listed hostnames (lowercase, rank order). */
export function trancoTopDomains(csv: string, n: number): string[] {
  const domains: string[] = [];
  for (const line of csv.split('\n')) {
    if (domains.length >= n) break;
    const domain = line.split(',')[1]?.trim().toLowerCase();
    if (domain) domains.push(domain);
  }
  return domains;
}

/**
 * Registrable domain → best rank, stopping once `maxDomains` distinct registrable domains are
 * collected.
 */
export function parseTranco(csv: string, maxDomains: number): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const line of csv.split(/\r?\n/)) {
    if (ranks.size >= maxDomains) break;
    const [rankText, host] = line.split(',');
    const rank = Number(rankText);
    if (!host || !Number.isInteger(rank)) continue;
    const domain = registrableDomain(host);
    if (domain && !ranks.has(domain)) ranks.set(domain, rank);
  }
  return ranks;
}
