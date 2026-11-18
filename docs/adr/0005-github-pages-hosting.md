# ADR-0005: Host on GitHub Pages instead of AWS

Status: Accepted — 2026-11-18. Supersedes the hosting parts of ADR-0004 and ticket 10.

## Context

The site is fully static and runs entirely in the browser (ADR-0001). The available AWS account
belongs to an AWS Organization whose service control policy denies GitHub OIDC providers, and a
personal AWS account would add billing risk for a portfolio project. GitHub Pages hosts static
sites for free from the repository that already holds the code.

## Decision

- Publish `web/dist` with `.github/workflows/pages.yml` (lint, test, build, then
  `actions/deploy-pages`) on every push to `main`.
- Build with `base: './'`: Pages serves the site under `/izanami/`, and hash routing needs no
  server rewrites.
- Pages can't set response headers, so the CSP from `infra/lib/csp.ts` is injected as a
  `<meta http-equiv="Content-Security-Policy">` tag by `web/csp-meta-plugin.ts`.
  `frame-ancestors` is omitted there because browsers ignore it in a meta CSP.
- Keep `infra/` (S3 + CloudFront + OIDC role) as an optional alternative; the AWS deploy workflow
  is removed.

## Consequences

- Free, no AWS account or credentials, nothing to maintain.
- Lost compared to CloudFront: HSTS preload, `X-Content-Type-Options`, `Referrer-Policy` header
  and `frame-ancestors` (clickjacking protection). GitHub Pages does serve HTTPS and HSTS for
  `*.github.io`. `Referrer-Policy: no-referrer` can still be set via a `<meta name="referrer">`.
- Mozilla Observatory A+ (ADR-0004) is no longer reachable; expect a lower grade because of the
  missing headers.
