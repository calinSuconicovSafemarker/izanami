import type { DnsResult, LookupClient, RdapResult } from '../lookup';

/** One raw result line in the terminal. */
export interface TerminalLine {
  /** `NS`, `A`, `AAAA`, `MX`, `TXT` or `RDAP`. */
  source: string;
  tone: 'ok' | 'muted' | 'warn';
  text: string;
}

function dnsLine(r: DnsResult): TerminalLine {
  const source = r.type;
  if (r.status === 'unavailable') return { source, tone: 'warn', text: "couldn't check" };
  if (r.status === 'not-found') return { source, tone: 'muted', text: 'NXDOMAIN (no such name)' };
  if (r.records.length === 0) return { source, tone: 'muted', text: 'no records' };
  if (r.type === 'TXT') {
    // Only SPF matters here; verification tokens are noise.
    const spf = r.records.find((t) => /^v=spf1\b/i.test(t));
    const others = r.records.length - (spf ? 1 : 0);
    const rest = others ? `+${others} other record${others === 1 ? '' : 's'}` : '';
    return { source, tone: 'ok', text: [spf ?? 'no SPF', rest].filter(Boolean).join(' · ') };
  }
  return { source, tone: 'ok', text: r.records.join(', ') };
}

function rdapLine(r: RdapResult): TerminalLine {
  const source = 'RDAP';
  if (r.status === 'unavailable') return { source, tone: 'warn', text: "couldn't check" };
  if (r.status === 'not-found') return { source, tone: 'muted', text: 'not registered (404)' };
  const parts = ['registered'];
  if (r.registrationDate) parts.push(r.registrationDate.slice(0, 10));
  if (r.registrar) parts.push(`registrar ${r.registrar}`);
  if (r.registrant) parts.push(`registrant ${r.registrant}`);
  return { source, tone: 'ok', text: parts.join(' · ') };
}

/**
 * Wrap a client so every DNS/RDAP result for `domain` is reported as a terminal line
 * the moment it arrives. Other lookups (ASN, certs, the official domain) pass through silently.
 */
export function tapLookups(
  client: LookupClient,
  domain: string,
  onLine: (line: TerminalLine) => void,
): LookupClient {
  const mine = (name: string) => name.toLowerCase() === domain.toLowerCase();
  return {
    dns: async (name, type) => {
      const r = await client.dns(name, type);
      if (mine(name)) onLine(dnsLine(r));
      return r;
    },
    rdap: async (d) => {
      const r = await client.rdap(d);
      if (mine(d)) onLine(rdapLine(r));
      return r;
    },
    asn: (ip) => client.asn(ip),
    certs: (d) => client.certs(d),
  };
}
