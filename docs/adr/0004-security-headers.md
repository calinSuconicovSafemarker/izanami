# ADR-0004: Strict security headers with a generated CSP allowlist

Status: Accepted — 2026-11-17

## Context

It's a security tool and a security CV piece, so it should be hardened itself. The browser calls DoH, RDAP and crt.sh directly. RDAP redirects to many registry servers, so a hand-written `connect-src` would be incomplete.

## Decision

- S3 bucket is private; CloudFront reads it via Origin Access Control.
- `Content-Security-Policy` (set by a viewer-response CloudFront Function, see below): `default-src 'self'`; `script-src 'self'`; `style-src 'self'`; `img-src 'self' data:`; `connect-src` = DoH endpoints + rdap.org + data.iana.org + every RDAP host from the IANA bootstrap (generated `rdap-hosts.json`) + crt.sh; `frame-ancestors 'none'`; `base-uri 'none'`; `form-action 'none'`.
- A CDK `ResponseHeadersPolicy` sets:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `X-Frame-Options: DENY` (legacy companion to `frame-ancestors`)
- CSP delivery: CloudFront caps a ResponseHeadersPolicy CSP value at 1783 characters, and the generated allowlist (~380 RDAP origins) is ~9 KB. Collapsing hosts to `https://*.<registrable-domain>` saves little (~7.6 KB, most TLD registries use distinct domains) and widens the policy, so instead `infra/lib/csp.ts` generates a cloudfront-js-2.0 viewer-response function carrying the exact list (`https://` prefixes stripped in the source to stay under the 10 KB function-size limit; ~6.8 KB today). A unit test fails the build if it would exceed the limit. `object-src 'none'` is also set.
- Hash routing avoids SPA rewrite rules.
- Acceptance target: Mozilla Observatory A+.

## Consequences

- The CSP header is ~9 KB on every response and a function invocation is billed per request (CloudFront Functions, negligible at this scale). If the bootstrap grows past the 10 KB code limit, the fallback is Lambda@Edge or wildcarding by registrable domain.
- A new RDAP server added to the IANA bootstrap after the last build is blocked until a rebuild; the lookup falls back to `unknown` for registration rules.
- No inline scripts/styles allowed, which constrains Vite/Tailwind config.
