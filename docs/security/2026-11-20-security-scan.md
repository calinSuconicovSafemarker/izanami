# Security scan — 2026-11-20

Scope: the whole repo at `a4f1d9b` (web app, build scripts, JSON API, AWS CDK stack, CI workflows) and the two live sites (`d1kyj53r37y0uu.cloudfront.net`, GitHub Pages).

## What was run

| Check | Tool | Result |
|---|---|---|
| Static code scan | Semgrep 1.186 (rulesets `p/typescript`, `p/react`, `p/nodejs`, `p/secrets`, `p/github-actions`) | 7 findings, all "action pinned to a mutable tag" in CI |
| Dependencies | `npm audit` | 2 moderate: `minimatch` ReDoS inside `aws-cdk-lib` (build-time only, not shipped to users) |
| Secrets | Pattern search over all 97 commits (AWS keys, private keys, GitHub/Slack/OpenAI/Google tokens, passwords) + tracked-file check | None found; `.env*` ignored |
| AWS configuration | cdk-nag 3.0.2, `AwsSolutionsChecks`, both stacks | 8 rules flagged (see below) |
| Manual review | Code read of `api/`, `web/src/lookup`, `web/src/check`, rendering/export code, `infra/`, `.github/`, `scripts/` | No High/Critical; 3 Medium, several Low/Info |
| Live headers | `curl` on both sites and `/api/*` | CloudFront: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer` on site and API. Pages: no header control |
| Deployed state | `aws cloudformation list-stacks` | Only `IzanamiStack` (+ CDK bootstrap). The GitHub OIDC deploy stack is **not** deployed; the org SCP denies OIDC provider access |

## Findings

| # | Severity | Finding | Action |
|---|---|---|---|
| F1 | Medium | **API can be throttled by ~10 parallel requests.** No rate limit/WAF; account concurrency cap is 10 and shared with the deploy Lambda; the cache key is trivially bypassed (`GOOGLE.com`, `example.com.`, subdomains, punycode vs Unicode all miss the cache but do the same work). Cost is bounded; availability isn't. | [Ticket 20](../tickets/20-api-abuse-protection.md) |
| F2 | Medium/Low | **Transient upstream failures are cached for 1 h.** A crt.sh timeout or DoH/RDAP 5xx returns `unknown` facts with `Cache-Control: public, max-age=3600`. | [Ticket 21](../tickets/21-lookup-hardening.md) |
| F3 | Medium (latent) | **CI build job can mint an AWS OIDC token.** `id-token: write` is workflow-wide in `pages.yml`, so `npm ci` install scripts could request a token the deploy role would trust. Not exploitable today (stack not deployed, SCP blocks OIDC), but fix before ever enabling it. | [Ticket 22](../tickets/22-ci-hardening.md) |
| F4 | Low | CI actions pinned to tags, not commit SHAs (Semgrep ×7). | Ticket 22 |
| F5 | Low | Upstream responses read without a size cap; `fetch` follows redirects to any scheme/host; DoH JSON shape not validated (a malformed answer gives a 500). Needs a misbehaving upstream, not user input. | Ticket 21 |
| F6 | Low | GitHub Pages copy can be framed (Pages can't send `X-Frame-Options`; meta CSP can't carry `frame-ancestors`). No state-changing actions, so impact is small. | [Ticket 23](../tickets/23-infra-hygiene.md) |
| F7 | Info | `x-amzn-requestid` / `x-amzn-trace-id` exposed on `/api/*`. | Ticket 23 |
| F8 | Info | No CloudFront/S3 access logs (cdk-nag S1, CFR3), so abuse can't be investigated. | Ticket 23 |
| F9 | Info | Lambda on Node 22, not latest (cdk-nag L1). | Ticket 23 |
| F10 | Info | `minimatch` advisory in `aws-cdk-lib` (build-time). | Ticket 23 |

## Accepted / not applicable

- **CFR4 — TLS 1.0 allowed:** the default `*.cloudfront.net` certificate can't have its minimum TLS raised; needs a custom domain (parked).
- **CFR1 — geo restriction:** not wanted; the tool is global.
- **IAM4 / IAM5:** `AWSLambdaBasicExecutionRole` on the API (logs only) and the wildcards on CDK's own `BucketDeployment` role (scoped to the CDK asset bucket and our site bucket). Standard CDK constructs; accepted with suppressions and reasons.
- **CFR2 — WAF:** covered by ticket 20 (decision on cost there).

## Checked and fine

Input validation (one value per parameter, 253-char cap, strict LDH + ICANN suffix, no IPs, org allowlist, exact routes, GET/HEAD only); no stack traces in errors; no SSRF (RDAP host only from bundled IANA map, domain always `encodeURIComponent`-ed, ASN names built from validated IPs); per-request work bounded with timeouts under the 15 s Lambda limit; S3 private + encrypted + TLS-only + OAC; Lambda function URL `AWS_IAM` + OAC (direct call → 403, verified live); no `dangerouslySetInnerHTML`, all links https-checked, upstream strings rendered as text; CSV export guards formula injection; no secrets in history; CI has read-only permissions and no `pull_request_target`.
