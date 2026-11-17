export interface RdapHosts {
  /** TLD (lowercase, punycode) → RDAP base URL ending in `/`. */
  servers: Record<string, string>;
  /** Unique https origins of all RDAP servers, for the CSP `connect-src` (ADR-0004). */
  hosts: string[];
}

interface Bootstrap {
  services: string[][][];
}

/** Turns the IANA RDAP DNS bootstrap (`dns.json`) into TLD → https base URL plus an origin list. */
export function parseRdapBootstrap(bootstrap: Bootstrap): RdapHosts {
  const servers: Record<string, string> = {};
  const hosts = new Set<string>();
  for (const [tlds = [], urls = []] of bootstrap.services) {
    const url = urls.find((u) => u.startsWith('https://'));
    if (!url) continue;
    const base = url.endsWith('/') ? url : `${url}/`;
    hosts.add(new URL(base).origin);
    for (const tld of tlds) servers[tld.toLowerCase()] = base;
  }
  return {
    servers: Object.fromEntries(Object.entries(servers).sort(([a], [b]) => a.localeCompare(b))),
    hosts: [...hosts].sort(),
  };
}
