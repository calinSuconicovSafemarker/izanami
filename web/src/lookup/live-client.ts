import type {
  AsnResult,
  CertEntry,
  CertResult,
  DnsResult,
  DnsType,
  FetchLike,
  LookupClient,
  RdapBaseUrls,
  RdapResult,
} from './types';
import { parseRdapDomain, type RdapDomain } from './rdap';

const DNS_TYPE_CODES: Record<DnsType, number> = { A: 1, NS: 2, MX: 15, TXT: 16, AAAA: 28 };

const DOH_RESOLVERS = [
  'https://cloudflare-dns.com/dns-query',
  'https://dns.google/resolve',
] as const;

export const RDAP_FALLBACK_BASE_URL = 'https://rdap.org/';

const NOERROR = 0;
const NXDOMAIN = 3;

export interface LiveLookupClientOptions {
  /** Defaults to the global fetch. */
  fetch?: FetchLike;
  /** TLD → RDAP base URL (from the IANA bootstrap). Unlisted TLDs use rdap.org. */
  rdapBaseUrls?: RdapBaseUrls;
  /** crt.sh is slow and flaky; give up after this long. Default 5000. */
  certsTimeoutMs?: number;
}

interface CrtShEntry {
  common_name?: string;
  issuer_name?: string;
  not_before?: string;
  not_after?: string;
}

interface DohAnswer {
  type: number;
  data: string;
}
interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

export class LiveLookupClient implements LookupClient {
  private readonly fetch: FetchLike;
  private readonly rdapBaseUrls: RdapBaseUrls;
  private readonly certsTimeoutMs: number;

  constructor(options: LiveLookupClientOptions = {}) {
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.rdapBaseUrls = options.rdapBaseUrls ?? {};
    this.certsTimeoutMs = options.certsTimeoutMs ?? 5000;
  }

  async dns(name: string, type: DnsType): Promise<DnsResult> {
    for (const resolver of DOH_RESOLVERS) {
      const body = await this.getJson<DohResponse>(
        `${resolver}?name=${encodeURIComponent(name)}&type=${type}`,
        'application/dns-json',
      );
      if (!body) continue;
      if (body.Status === NXDOMAIN) return { status: 'not-found', name, type, records: [] };
      if (body.Status !== NOERROR) continue;
      const code = DNS_TYPE_CODES[type];
      const records = (body.Answer ?? [])
        .filter((a) => a.type === code)
        .map((a) => normalise(type, a.data));
      return { status: 'ok', name, type, records };
    }
    return { status: 'unavailable', name, type, records: [] };
  }

  async rdap(domain: string): Promise<RdapResult> {
    const tld = domain.slice(domain.lastIndexOf('.') + 1).toLowerCase();
    const base = this.rdapBaseUrls[tld] ?? RDAP_FALLBACK_BASE_URL;
    const url = `${base.endsWith('/') ? base : `${base}/`}domain/${encodeURIComponent(domain)}`;
    const unavailable: RdapResult = { status: 'unavailable', domain, nameservers: [] };
    try {
      const res = await this.request(url, 'application/rdap+json');
      if (res.status === 404)
        return { status: 'not-found', domain, registered: false, nameservers: [] };
      if (!res.ok) return unavailable;
      return {
        status: 'ok',
        domain,
        registered: true,
        ...parseRdapDomain((await res.json()) as RdapDomain),
      };
    } catch {
      return unavailable;
    }
  }

  /** Origin AS via DoH TXT `<reversed-ip>.origin(6).asn.cymru.com`. */
  async asn(ip: string): Promise<AsnResult> {
    const query = cymruQueryName(ip);
    if (!query) return { status: 'unavailable', ip };
    const txt = await this.dns(query, 'TXT');
    if (txt.status !== 'ok') return { status: txt.status, ip };
    // "1128 | 130.161.0.0/16 | NL | ripencc | 1988-08-26"; several origins are space-separated.
    const [asns = '', prefix, country] = (txt.records[0] ?? '').split('|').map((f) => f.trim());
    const asn = Number(asns.split(/\s+/)[0]);
    if (!Number.isInteger(asn) || asn <= 0) return { status: 'not-found', ip };
    return { status: 'ok', ip, asn, ...(prefix && { prefix }), ...(country && { country }) };
  }

  /** Certificate Transparency history from crt.sh. Never throws. */
  async certs(domain: string): Promise<CertResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.certsTimeoutMs);
    try {
      const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
      const res = await this.request(url, undefined, controller.signal);
      if (!res.ok) return { status: 'unavailable', domain, certs: [] };
      const entries = (await res.json()) as CrtShEntry[];
      const certs = entries.map(toCertEntry).sort((a, b) => a.notBefore.localeCompare(b.notBefore));
      return { status: 'ok', domain, certs };
    } catch {
      return { status: 'unavailable', domain, certs: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Every request goes through here so they stay CORS-simple and anonymous:
   * no cookies, no Referer, and no header except `accept`.
   */
  private request(url: string, accept?: string, signal?: AbortSignal): Promise<Response> {
    return this.fetch(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      ...(accept && { headers: { accept } }),
      ...(signal && { signal }),
    });
  }

  /** GET returning parsed JSON for 2xx, otherwise undefined. Never throws. */
  private async getJson<T>(url: string, accept: string): Promise<T | undefined> {
    try {
      const res = await this.request(url, accept);
      if (!res.ok) return undefined;
      return (await res.json()) as T;
    } catch {
      return undefined;
    }
  }
}

/** TXT: join the quoted character-strings; names: drop the trailing root dot. */
function normalise(type: DnsType, data: string): string {
  if (type === 'TXT') {
    const chunks = data.match(/"(?:[^"\\]|\\.)*"/g);
    if (!chunks) return data;
    return chunks.map((c) => c.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
  }
  return data.replace(/\.$/, '');
}

function cymruQueryName(ip: string): string | undefined {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return `${ip.split('.').reverse().join('.')}.origin.asn.cymru.com`;
  }
  if (!ip.includes(':')) return undefined;
  const [head = '', tail, ...rest] = ip.toLowerCase().split('::');
  if (rest.length) return undefined;
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const missing = 8 - h.length - t.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return undefined;
  const groups = [...h, ...Array<string>(missing).fill('0'), ...t];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return undefined;
  const nibbles = groups.map((g) => g.padStart(4, '0')).join('');
  return `${nibbles.split('').reverse().join('.')}.origin6.asn.cymru.com`;
}

function toCertEntry(e: CrtShEntry): CertEntry {
  return {
    commonName: e.common_name ?? '',
    issuer: e.issuer_name ?? '',
    notBefore: utc(e.not_before),
    notAfter: utc(e.not_after),
  };
}

/** crt.sh timestamps are UTC without a zone designator. */
function utc(timestamp = ''): string {
  return timestamp && !/(Z|[+-]\d\d:?\d\d)$/.test(timestamp) ? `${timestamp}Z` : timestamp;
}
