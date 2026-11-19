import type { Candidate } from '../domain';
import type { DnsResult, LookupClient } from '../lookup';

/** `yes` = delegated (has NS), `no` = NXDOMAIN, `unknown` = no answer or no NS records. */
export type Exists = 'yes' | 'no' | 'unknown';

export interface ScanResult {
  candidate: Candidate;
  exists: Exists;
  nameservers: string[];
}

/** Politeness ceiling: never more parallel DoH queries than this. */
export const MAX_SCAN_CONCURRENCY = 4;
export const DEFAULT_SCAN_DELAY_MS = 150;

export interface ScanOptions {
  /** Parallel queries, capped at {@link MAX_SCAN_CONCURRENCY}. Default 4. */
  concurrency?: number;
  /** Pause each worker this long between queries. Default 150 ms. */
  delayMs?: number;
  /** Abort to stop dispatching; results that settle afterwards are dropped. */
  signal?: AbortSignal;
  onResult?: (result: ScanResult, index: number) => void;
}

function existsFrom(dns: DnsResult): Exists {
  if (dns.status === 'not-found') return 'no';
  if (dns.status === 'ok' && dns.records.length > 0) return 'yes';
  return 'unknown';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check which candidates exist with one DoH NS query each (passive, no contact with the
 * candidate's own servers). Concurrency-limited and paced; never throws. Resolves with
 * the settled results in candidate order (fewer than requested when cancelled).
 */
export async function scanCandidates(
  candidates: readonly Candidate[],
  client: LookupClient,
  options: ScanOptions = {},
): Promise<ScanResult[]> {
  const { signal, onResult } = options;
  const delayMs = options.delayMs ?? DEFAULT_SCAN_DELAY_MS;
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? MAX_SCAN_CONCURRENCY, MAX_SCAN_CONCURRENCY),
  );
  const results: (ScanResult | undefined)[] = [];
  let next = 0;

  const worker = async () => {
    while (!signal?.aborted && next < candidates.length) {
      const index = next++;
      const candidate = candidates[index]!;
      const dns = await client.dns(candidate.domain, 'NS').catch((): DnsResult => ({
        status: 'unavailable',
        name: candidate.domain,
        type: 'NS',
        records: [],
      }));
      if (signal?.aborted) return;
      const result: ScanResult = {
        candidate,
        exists: existsFrom(dns),
        nameservers: dns.status === 'ok' ? dns.records : [],
      };
      results[index] = result;
      onResult?.(result, index);
      if (delayMs > 0 && next < candidates.length) await sleep(delayMs);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results.filter((r): r is ScanResult => r !== undefined);
}
