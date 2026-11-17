# ADR-0004: Strict security headers with a generated CSP allowlist

Status: Accepted — 2026-11-17

## Context

It's a security tool and a security CV piece, so it should be hardened itself. The browser calls DoH, RDAP and crt.sh directly. RDAP redirects to many registry servers, so a hand-written `connect-src` would be incomplete.

## Decision

- S3 bucket is private; CloudFront reads it via Origin Access Control.
- A CDK `ResponseHeadersPolicy` sets:
  - `Content-Security-Policy`: `default-src 'self'`; `script-src 'self'`; `style-src 'self'`; `img-src 'self' data:`; `connect-src` = DoH endpoints + rdap.org + data.iana.org + every RDAP host from the IANA bootstrap (generated `rdap-hosts.json`) + crt.sh; `frame-ancestors 'none'`; `base-uri 'none'`; `form-action 'none'`.
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
- Hash routing avoids SPA rewrite rules.
- Acceptance target: Mozilla Observatory A+.

## Consequences

- A new RDAP server added to the IANA bootstrap after the last build is blocked until a rebuild; the lookup falls back to `unknown` for registration rules.
- No inline scripts/styles allowed, which constrains Vite/Tailwind config.
