# 09 — AWS infrastructure (CDK)

**Depends on:** 00, 02 (`rdap-hosts.json` for CSP)

## Goal
A CDK stack that hosts `web/dist` securely per [ADR-0004](../adr/0004-security-headers.md).

## Scope
- Private S3 bucket (block public access, encryption, no website hosting).
- CloudFront distribution with Origin Access Control, default root object `index.html`, HTTPS only, default `*.cloudfront.net` domain.
- `ResponseHeadersPolicy` with CSP (generated `connect-src` from DoH endpoints + rdap.org + data.iana.org + `rdap-hosts.json` hosts + crt.sh), HSTS, nosniff, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`.
- `BucketDeployment` of `web/dist` with CloudFront invalidation.
- Cache policy: long TTL for hashed assets, short for `index.html`.
- Outputs: distribution URL, bucket name, distribution ID.
- CDK assertion tests for OAC, no public bucket, and header policy contents.

## Acceptance criteria
- `npx cdk synth` succeeds; assertion tests pass.
- After a manual `cdk deploy`, the site loads, a live lookup works (CSP not blocking DoH/RDAP — check console), and Mozilla Observatory scores A+.
- Direct S3 object URL returns 403.
