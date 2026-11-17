# 04 — LookupClient

**Depends on:** 00

## Goal
One interface for every network lookup, with a live implementation and a fixture implementation.

## Scope
```ts
interface LookupClient {
  dns(name: string, type: 'A'|'AAAA'|'NS'|'MX'|'TXT'): Promise<DnsResult>;   // status incl. NXDOMAIN
  rdap(domain: string): Promise<RdapResult>;   // registered?, registrationDate, registrar, registrant?(if unredacted), nameservers
  asn(ip: string): Promise<AsnResult>;         // via DoH TXT <reversed-ip>.origin.asn.cymru.com
  certs(domain: string): Promise<CertResult>;  // crt.sh, optional
}
```
- DoH: Cloudflare JSON (`accept: application/dns-json`), Google fallback.
- RDAP: TLD → base URL from `rdap-hosts.json`, fallback `https://rdap.org/domain/`. 404 → `registered: false`. Parse `events[eventAction=registration]`, registrar entity, redaction-aware registrant.
- crt.sh with ~5 s timeout; failures → `{ status: 'unavailable' }`, never throw to the UI.
- Every result carries `status: 'ok'|'not-found'|'unavailable'` so rules can return `unknown`.
- `FixtureLookupClient` reading recorded JSON from `web/src/lookup/fixtures/`.
- Record fixtures for: `tudelft.nl`, `google.com`, an NXDOMAIN, a `.guide` 404, a redacted `.nl` RDAP.
- Session cache (Map) so the official domain's facts are fetched once.

## Acceptance criteria
- Unit tests run only against fixtures (no network in CI).
- `npm run test:live -w web` (not in CI) hits real endpoints for `tudelft.nl` and passes.
- No credentials, cookies or custom headers beyond `accept` are sent (keeps requests CORS-simple).
