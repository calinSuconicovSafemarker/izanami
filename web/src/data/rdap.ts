import data from './rdap-hosts.json';

const servers: Readonly<Record<string, string>> = data.servers;

/** RDAP server origins from the IANA bootstrap; also feeds the CSP `connect-src` (ADR-0004). */
export const rdapHosts: readonly string[] = data.hosts;

/** RDAP base URL (ending in `/`) for a TLD, or undefined when IANA lists no https server. */
export function rdapBaseUrl(tld: string): string | undefined {
  return servers[tld.trim().toLowerCase().replace(/\.$/, '')];
}
