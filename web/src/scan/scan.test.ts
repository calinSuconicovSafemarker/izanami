import { describe, expect, it } from 'vitest';
import type { Candidate } from '../domain';
import type { DnsResult, DnsType, LookupClient } from '../lookup';
import { FixtureLookupClient } from '../lookup/fixture-client';
import { scanCandidates } from './scan';

const candidate = (domain: string): Candidate => ({
  domain,
  display: domain,
  technique: 'tld-swap',
  tld: domain.slice(domain.lastIndexOf('.') + 1),
});

/** Records every DNS query and resolves each one only when the test releases it. */
class GatedClient implements LookupClient {
  queries: { name: string; type: DnsType }[] = [];
  inFlight = 0;
  maxInFlight = 0;
  private gates: (() => void)[] = [];

  async dns(name: string, type: DnsType): Promise<DnsResult> {
    this.queries.push({ name, type });
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await new Promise<void>((resolve) => this.gates.push(resolve));
    this.inFlight--;
    return { status: 'not-found', name, type, records: [] };
  }
  /** Release every waiting query, then let the scan schedule the next ones. */
  async releaseAll() {
    const gates = this.gates;
    this.gates = [];
    gates.forEach((g) => g());
    await new Promise((r) => setTimeout(r, 0));
  }
  rdap = () => Promise.reject(new Error('scan must not use RDAP'));
  asn = () => Promise.reject(new Error('scan must not use ASN'));
  certs = () => Promise.reject(new Error('scan must not use crt.sh'));
}

describe('scanCandidates', () => {
  it('reports existence from recorded DoH NS answers', async () => {
    const results = await scanCandidates(
      [
        candidate('google.com'),
        candidate('tudelft-lookalike-xq7z.nl'),
        candidate('unrecorded.example'),
      ],
      new FixtureLookupClient(),
      { delayMs: 0 },
    );
    expect(results.map((r) => [r.candidate.domain, r.exists])).toEqual([
      ['google.com', 'yes'],
      ['tudelft-lookalike-xq7z.nl', 'no'],
      ['unrecorded.example', 'unknown'],
    ]);
    expect(results[0]?.nameservers).toContain('ns1.google.com');
  });

  it('runs at most 4 NS queries at a time and nothing but NS', async () => {
    const client = new GatedClient();
    const domains = Array.from({ length: 10 }, (_, i) => `brand${i}.com`);
    const done = scanCandidates(domains.map(candidate), client, { delayMs: 0 });
    while (client.queries.length < 10 || client.inFlight > 0) await client.releaseAll();
    const results = await done;
    expect(client.maxInFlight).toBe(4);
    expect(client.queries.every((q) => q.type === 'NS')).toBe(true);
    expect(results.map((r) => r.exists)).toEqual(Array(10).fill('no'));
  });

  it('never exceeds 4 in flight even when asked for more', async () => {
    const client = new GatedClient();
    const done = scanCandidates(
      Array.from({ length: 8 }, (_, i) => candidate(`b${i}.com`)),
      client,
      { delayMs: 0, concurrency: 16 },
    );
    while (client.queries.length < 8 || client.inFlight > 0) await client.releaseAll();
    await done;
    expect(client.maxInFlight).toBe(4);
  });

  it('stops dispatching queries once cancelled', async () => {
    const client = new GatedClient();
    const controller = new AbortController();
    const seen: string[] = [];
    const done = scanCandidates(
      Array.from({ length: 12 }, (_, i) => candidate(`c${i}.com`)),
      client,
      {
        delayMs: 0,
        signal: controller.signal,
        onResult: (r) => seen.push(r.candidate.domain),
      },
    );
    await client.releaseAll(); // first 4 settle, next 4 start
    controller.abort();
    await client.releaseAll();
    await client.releaseAll();
    const results = await done;
    expect(client.queries).toHaveLength(8);
    expect(results.length).toBeLessThan(12);
    expect(seen).toEqual(['c0.com', 'c1.com', 'c2.com', 'c3.com']);
  });
});
