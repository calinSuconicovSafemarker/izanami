# 18 — JSON API (AWS Lambda behind CloudFront)

**Status:** Done (14afe4c)

**Depends on:** B3 (export JSON shape)

## Goal
Let other tools (e.g. Safemarker scripts) send a domain and get the same result the website shows, as JSON, with no browser. Amends [ADR-0001](../adr/0001-browser-only-runtime.md): the website stays browser-only; the API is an optional extra runtime that reuses the same code.

## Scope
- **Endpoints** (same origin as the site, under `/api/`):
  - `GET /api/check?org=<org-id>&domain=<variant>` → the lookup result as JSON, same shape as the website's "Export JSON" (schemaVersion 1, `toLookupExport`): verdict, score, why, every rule with weight + explanation, facts, domain analysis, TLD rating, data sources used.
  - `GET /api/orgs` → `[{ id, name, primaryDomain }]`.
  - `GET /api/orgs/<org-id>` → official context: primary, official domains (with source/trust level), Wikidata-owned related domains (verify level), brand TLDs.
  - `GET /api/health` → `{ ok: true, dataVersion }`.
  - Errors as JSON `{ error: { code, message } }` with 400 (bad/missing input, invalid domain), 404 (unknown org / route), 405 (non-GET), 500/504 (upstream failure or timeout). Never a stack trace.
- **One code path:** the handler imports the existing pure modules (`web/src/domain`, `rules`, `orgs`, `tld`, `export`, `lookup` live client) — no copy of logic. Put the handler in a new npm workspace `api/` (Node 22, TS). If a module is browser-only (DOM, `window`), split it; do not fork it.
- **Runtime lookups server-side:** DoH, RDAP, ASN, crt.sh through the existing `LookupClient` (Node 22 has `fetch`). Per-call timeouts; overall handler budget < 12 s; crt.sh optional (if it times out, that fact is `unknown`, the verdict still returns).
- **Infra (CDK, `infra/`):**
  - `NodejsFunction` (Node 22, arm64, 512 MB, 15 s timeout), bundled with esbuild locally (no Docker; add `esbuild` as a devDependency if needed).
  - Lambda **Function URL with `AWS_IAM` auth**, reachable only through CloudFront via **Origin Access Control** for Lambda. Direct calls to the function URL must be denied.
  - CloudFront behaviour `/api/*` → that origin. Cache policy keyed on the query strings `org` and `domain` only, default TTL 1 h (repeat checks are free and don't hit upstreams). Origin request policy forwards those query strings. GET/HEAD only.
  - The existing security response headers apply to `/api/*`. JSON responses also send `Access-Control-Allow-Origin: *` (read-only, no credentials) and `Cache-Control: public, max-age=3600` on success, `no-store` on errors.
  - No reserved concurrency: the account limit is 10 concurrent executions total (checked 2026-11-19), which is the natural cap. Document this.
  - Log retention 1 week. No secrets, no other AWS services.
- **Input hardening:** domain max 253 chars, IDN → punycode via the existing parser, reject IPs/URLs with paths, `org` must match an id in `orgs.json`. The API never fetches a user-supplied URL — only DoH/RDAP/ASN/crt.sh lookups of the parsed registrable domain, same as the site.
- **Docs:** ADR-0006 "JSON API" (why Lambda + function URL + OAC, caching, concurrency cap, cost: inside the always-free tier). SPEC section "API". README section with `curl` examples. Update the data-flow/privacy text: queries sent to the API are seen by our Lambda (logs keep no query strings beyond CloudWatch's default request log — say exactly what is logged).

## Acceptance criteria
- `curl "https://<distribution>/api/check?org=google&domain=c.gle"` → JSON, verdict Official; `domain=gooogle.com` → a scored verdict with `why` and rules; `domain=meebo.com` → scored, not Official.
- The JSON for a domain matches what the website's Export JSON gives for the same lookup (modulo timestamps / live data).
- Direct call to the Lambda function URL → 403.
- Second identical request is a CloudFront cache hit (`x-cache: Hit from cloudfront`).
- Bad input → 400 JSON; unknown org → 404 JSON.
- Handler unit tests with the `FixtureLookupClient` (no network in CI); CDK assertion tests for the function URL auth type, OAC, `/api/*` behaviour and cache key. lint, test, build, synth all pass.
