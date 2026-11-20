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

/** Upstream body size caps (security scan F5): a larger answer makes that fact `unavailable`. */
export const MAX_BODY_BYTES = {
  doh: 64 * 1024,
  rdap: 512 * 1024,
  certs: 5 * 1024 * 1024,
} as const;

/** Redirects followed per request (rdap.org → registry RDAP server needs one). */
export const MAX_REDIRECTS = 2;

/** An upstream answer we refuse to use (too big, bad redirect); the fact becomes unavailable. */
class RejectedResponse extends Error {}

export interface LiveLookupClientOptions {
  /** Defaults to the global fetch. */
  fetch?: FetchLike;
  /** TLD → RDAP base URL (from the IANA bootstrap). Unlisted TLDs use rdap.org. */
  rdapBaseUrls?: RdapBaseUrls;
  /** crt.sh is slow and flaky; give up after this long. Default 5000. */
  certsTimeoutMs?: number;
  /**
   * Give up on any single DoH/RDAP request after this long; it then counts as failed (the next
   * resolver is tried, or the result is `unavailable`). Default: no limit, as in the browser,
   * where the user can retry. The API sets one to stay inside its time budget.
   */
  requestTimeoutMs?: number;
  /** Aborting it fails every request in flight or started later (an overall deadline). */
  signal?: AbortSignal;
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

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** DoH JSON: integer `Status`, optional `Answer` array of `{type: number, data: string}`. */
function isDohResponse(v: unknown): v is DohResponse {
  if (!isObject(v) || !Number.isInteger(v.Status)) return false;
  if (v.Answer === undefined) return true;
  return (
    Array.isArray(v.Answer) &&
    v.Answer.every((a) => isObject(a) && typeof a.type === 'number' && typeof a.data === 'string')
  );
}

export class LiveLookupClient implements LookupClient {
  private readonly fetch: FetchLike;
  private readonly rdapBaseUrls: RdapBaseUrls;
  private readonly certsTimeoutMs: number;
  private readonly requestTimeoutMs: number | undefined;
  private readonly signal: AbortSignal | undefined;

  constructor(options: LiveLookupClientOptions = {}) {
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.rdapBaseUrls = options.rdapBaseUrls ?? {};
    this.certsTimeoutMs = options.certsTimeoutMs ?? 5000;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.signal = options.signal;
  }

  async dns(name: string, type: DnsType): Promise<DnsResult> {
    for (const resolver of DOH_RESOLVERS) {
      const body = await this.getDoh(`${resolver}?name=${encodeURIComponent(name)}&type=${type}`);
      if (!body) continue; // failed, oversized or malformed: try the next resolver
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
      return await this.get(
        url,
        'application/rdap+json',
        async (res): Promise<RdapResult> => {
          if (res.status === 404)
            return { status: 'not-found', domain, registered: false, nameservers: [] };
          if (!res.ok) return unavailable;
          const body = await readJson(res, MAX_BODY_BYTES.rdap);
          if (!isObject(body)) return unavailable;
          return {
            status: 'ok',
            domain,
            registered: true,
            ...parseRdapDomain(body as RdapDomain),
          };
        },
        this.requestTimeoutMs,
      );
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
    const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
    try {
      return await this.get(
        url,
        undefined,
        async (res): Promise<CertResult> => {
          if (!res.ok) return { status: 'unavailable', domain, certs: [] };
          const entries = await readJson(res, MAX_BODY_BYTES.certs);
          if (!Array.isArray(entries)) return { status: 'unavailable', domain, certs: [] };
          const certs = entries
            .filter(isObject)
            .map((e) => toCertEntry(e as CrtShEntry))
            .sort((a, b) => a.notBefore.localeCompare(b.notBefore));
          return { status: 'ok', domain, certs };
        },
        this.certsTimeoutMs,
      );
    } catch {
      return { status: 'unavailable', domain, certs: [] };
    }
  }

  /**
   * Every request goes through here so they stay CORS-simple and anonymous:
   * no cookies, no Referer, and no header except `accept`.
   *
   * `read` runs inside the deadline, so a slow body is cut off too. The deadline is `timeoutMs`
   * (when given) or the client's `signal`, whichever comes first; on expiry the fetch is aborted
   * and this rejects. It also rejects on a redirect we refuse to follow (see `send`).
   */
  private async get<T>(
    url: string,
    accept: string | undefined,
    read: (res: Response) => Promise<T>,
    timeoutMs: number | undefined,
  ): Promise<T> {
    if (timeoutMs === undefined && !this.signal) return read(await this.send(url, accept));

    const controller = new AbortController();
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () =>
        reject(new DOMException('Lookup timed out', 'TimeoutError')),
      );
    });
    aborted.catch(() => {}); // only observed through the race below
    const abort = () => controller.abort();
    const timer = timeoutMs === undefined ? undefined : setTimeout(abort, timeoutMs);
    const outer = this.signal;
    if (outer?.aborted) abort();
    outer?.addEventListener('abort', abort);
    try {
      // The race also settles when an injected fetch ignores the signal.
      return await Promise.race([this.send(url, accept, controller.signal).then(read), aborted]);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', abort);
    }
  }

  /**
   * GET with our own redirect policy: at most `MAX_REDIRECTS` hops, `https:` targets only;
   * anything else rejects (the fact becomes unavailable).
   *
   * We ask for `redirect: 'manual'` so each `Location` can be checked: Node (undici) returns the
   * 3xx with its headers. Browsers instead return an `opaqueredirect` response (status 0, no
   * `Location`) that cannot be inspected, which would break rdap.org → registry redirects. So on
   * `opaqueredirect` we repeat the request with `redirect: 'follow'` and let the browser follow:
   * it caps redirect chains itself, blocks mixed content on our https page and applies CORS and
   * private-network rules to every hop; we still reject a final non-https URL. Branching on the
   * response type rather than sniffing the runtime keeps one path for browsers, Node and fakes.
   */
  private async send(url: string, accept: string | undefined, signal?: AbortSignal) {
    const request = (target: string, redirect: NonNullable<RequestInit['redirect']>) =>
      this.fetch(target, {
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect,
        ...(accept && { headers: { accept } }),
        ...(signal && { signal }),
      });
    let target = url;
    for (let hops = 0; ; hops++) {
      const res = await request(target, 'manual');
      if (res.type === 'opaqueredirect') {
        const followed = await request(target, 'follow');
        if (followed.url && !followed.url.startsWith('https:')) {
          await discard(followed);
          throw new RejectedResponse('redirected to a non-https URL');
        }
        return followed;
      }
      const location = isRedirect(res.status) ? res.headers.get('location') : null;
      if (location === null) return res;
      await discard(res);
      if (hops >= MAX_REDIRECTS) throw new RejectedResponse('too many redirects');
      const next = new URL(location, target);
      if (next.protocol !== 'https:') throw new RejectedResponse('redirect to a non-https URL');
      target = next.href;
    }
  }

  /** DoH GET returning a well-formed DoH JSON body for 2xx, otherwise undefined. Never throws. */
  private async getDoh(url: string): Promise<DohResponse | undefined> {
    try {
      return await this.get(
        url,
        'application/dns-json',
        async (res) => {
          if (!res.ok) return undefined;
          const body = await readJson(res, MAX_BODY_BYTES.doh);
          return isDohResponse(body) ? body : undefined;
        },
        this.requestTimeoutMs,
      );
    } catch {
      return undefined;
    }
  }
}

const isRedirect = (status: number) => status >= 300 && status < 400;

/** Release a response body we will not read. */
async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // already consumed or errored: nothing to release
  }
}

/**
 * Read a body as text, rejecting once it exceeds `maxBytes`. Streams through `res.body`, so an
 * oversized answer is never buffered whole; falls back to `arrayBuffer()` when a fetch
 * implementation gives no stream.
 */
async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  const tooBig = () => new RejectedResponse(`response body over ${maxBytes} bytes`);
  // Content-Length is the encoded size; the decoded body is at least as large.
  if (Number(res.headers.get('content-length')) > maxBytes) {
    await discard(res);
    throw tooBig();
  }
  const decoder = new TextDecoder();
  if (!res.body) {
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw tooBig();
    return decoder.decode(buffer);
  }
  const reader = res.body.getReader();
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooBig();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** `readCappedText` + `JSON.parse`; rejects on an oversized or non-JSON body. */
async function readJson(res: Response, maxBytes: number): Promise<unknown> {
  return JSON.parse(await readCappedText(res, maxBytes)) as unknown;
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
