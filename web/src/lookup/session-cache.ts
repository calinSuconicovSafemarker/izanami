import type { LookupClient, LookupStatus } from './types';

/**
 * Wraps a client so each distinct lookup hits the network once per session
 * (e.g. the official domain's facts while the user tries many variants).
 * In-flight calls are shared; `unavailable` results are dropped so a retry can succeed.
 */
export function withSessionCache(client: LookupClient): LookupClient {
  const cache = new Map<string, Promise<{ status: LookupStatus }>>();

  function cached<T extends { status: LookupStatus }>(key: string, load: () => Promise<T>) {
    const hit = cache.get(key);
    if (hit) return hit as Promise<T>;
    const pending = load().then((result) => {
      if (result.status === 'unavailable') cache.delete(key);
      return result;
    });
    cache.set(key, pending);
    return pending;
  }

  return {
    dns: (name, type) => cached(`dns:${type}:${name.toLowerCase()}`, () => client.dns(name, type)),
    rdap: (domain) => cached(`rdap:${domain.toLowerCase()}`, () => client.rdap(domain)),
    asn: (ip) => cached(`asn:${ip.toLowerCase()}`, () => client.asn(ip)),
    certs: (domain) => cached(`certs:${domain.toLowerCase()}`, () => client.certs(domain)),
  };
}
