/**
 * Every lookup result carries a status so rules can return `unknown`:
 * - `ok`          the service answered and the answer is usable
 * - `not-found`   the service answered authoritatively that the thing does not exist
 *                 (DNS NXDOMAIN, RDAP 404)
 * - `unavailable` network error, timeout, CORS failure or unexpected response
 */
export type LookupStatus = 'ok' | 'not-found' | 'unavailable';

export type DnsType = 'A' | 'AAAA' | 'NS' | 'MX' | 'TXT';

export interface DnsResult {
  status: LookupStatus;
  name: string;
  type: DnsType;
  /**
   * Record data of the requested type only (CNAME hops are skipped).
   * TXT strings are unquoted and their chunks joined. Empty on NODATA.
   */
  records: string[];
}

export interface RdapResult {
  status: LookupStatus;
  domain: string;
  /** true on 200, false on 404, undefined when unavailable. */
  registered?: boolean;
  /** ISO 8601 from `events[eventAction=registration]`. */
  registrationDate?: string;
  registrar?: string;
  /** Only set when the registry returns it unredacted. */
  registrant?: string;
  /** Lower-case host names. */
  nameservers: string[];
}

export interface AsnResult {
  status: LookupStatus;
  ip: string;
  asn?: number;
  prefix?: string;
  country?: string;
}

export interface CertEntry {
  commonName: string;
  issuer: string;
  /** ISO 8601 (crt.sh omits the zone; it is UTC). */
  notBefore: string;
  notAfter: string;
}

export interface CertResult {
  status: LookupStatus;
  domain: string;
  /** Sorted oldest `notBefore` first. */
  certs: CertEntry[];
}

export interface LookupClient {
  dns(name: string, type: DnsType): Promise<DnsResult>;
  rdap(domain: string): Promise<RdapResult>;
  asn(ip: string): Promise<AsnResult>;
  certs(domain: string): Promise<CertResult>;
}

/** TLD (no dot, lower-case) → RDAP base URL ending in `/`, e.g. `{ nl: 'https://rdap.sidn.nl/' }`. */
export type RdapBaseUrls = Readonly<Record<string, string>>;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
