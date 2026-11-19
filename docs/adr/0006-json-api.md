# ADR-0006: JSON API on a Lambda function URL behind CloudFront

Status: Accepted — 2026-11-19. Amends [ADR-0001](0001-browser-only-runtime.md) (the website stays
browser-only; the API is an optional second runtime of the same code).

## Context

Other tools (e.g. Safemarker scripts) want the verdict the website shows without a browser. The
lookup is already pure TypeScript behind a `LookupClient`, and Node 22 has `fetch`, so the same
modules can run server-side. The AWS account is on the free plan in eu-north-1 with a Lambda
account concurrency limit of 10 (checked 2026-11-19). The site's CloudFront distribution
(ADR-0004) already exists.

## Decision

- **Runtime:** one Lambda function (`api/`, Node 22, arm64, 512 MB, 15 s timeout), bundled by
  CDK's `NodejsFunction` with a local esbuild (no Docker). The handler imports `web/src`
  (`check/startCheck`, `export/toLookupExport`, `orgs`, the live `LookupClient`) by relative path;
  nothing is copied. `startCheck` (parse → official check → `gatherFacts`) was extracted from the
  `useLookup` hook so the hook and the API share it.
- **Endpoints:** `GET /api/check?org=&domain=` (the Export JSON document), `GET /api/orgs`,
  `GET /api/orgs/<id>`, `GET /api/health`. Errors are `{ error: { code, message } }` with 400,
  404, 405, 500 or 504, never a stack trace.
- **Exposure: function URL + Origin Access Control, not API Gateway.** The function URL uses
  `AWS_IAM` auth and CloudFront signs requests to it with an OAC for Lambda, so the URL is only
  callable through the distribution; a direct call gets 403 from Lambda before our code runs.
  Same origin as the site (`/api/*` behaviour), so no extra domain, certificate or CORS
  preflight. API Gateway would add a second paid service and its own throttling layer for no gain
  on a GET-only API (OAC needs a signed payload hash for request bodies; we take none).
- **Caching:** cache policy keyed on the `org` and `domain` query strings only (no headers or
  cookies), default and max TTL 1 h; the origin request policy forwards just those two (and no
  `Host`, which would break the OAC signature). Success responses send
  `Cache-Control: public, max-age=3600`, errors `no-store`. Repeat checks are served from the edge
  and never reach DoH/RDAP/crt.sh. Two exceptions send `no-store` on a 200: `/api/health` (a
  cached health check proves nothing) and a check whose lookups were cut off by the time budget
  (its unknown facts are our timeout, not the domain's state).
- **Time budget:** each DoH/RDAP request gives up after 3 s (a DNS question with its fallback
  resolver: ≤ 6 s), crt.sh after 5 s (optional: on failure its fact is `unknown` and the verdict
  still returns), every lookup still running at 9 s is aborted, and 11 s is the hard 504 limit —
  under the 15 s Lambda timeout and CloudFront's 15 s origin read timeout.
- **Concurrency:** no reserved concurrency. The account's 10 concurrent executions are the
  natural cap on cost and on load we put on public resolvers and registries; reserving any would
  fail anyway, because Lambda requires a minimum of unreserved concurrency and the account's
  unreserved concurrency is already 10 (`UnreservedConcurrentExecutions`). Excess requests get a
  throttling error instead of queuing; cache hits are unaffected.
- **Input hardening:** `org` must be an id from `orgs.json`; `domain` ≤ 253 characters, a bare
  domain (no scheme, path, port, userinfo, spaces or control characters), then the website's own
  parser (IDN → punycode, IPs and names without a public suffix rejected). The API never fetches
  a user-supplied URL, only DoH/RDAP/ASN/crt.sh lookups of the parsed registrable domain.
- **Logging:** log group with 1-week retention. Lambda writes its default `START` / `END` /
  `REPORT` lines (request id, duration, memory); the handler adds one line for 5xx responses
  only, with the status and error code. No path, query, domain or IP is logged. CloudFront access
  logging stays off.
- No secrets and no other AWS services (no API Gateway, DynamoDB, WAF).

## Consequences

- One code path: the API body equals the website's Export JSON for the same lookup (a unit test
  compares them).
- Cost: inside the always-free tiers at this scale — Lambda 1 M requests and 400,000 GB-s per
  month (a 512 MB, ~1 s check is 0.5 GB-s, so ~800,000 uncached checks), CloudFront 10 M requests
  and 1 TB out, CloudWatch Logs 5 GB. The edge cache and the concurrency cap bound the worst case.
- Queries to the API are seen by our Lambda (and briefly cached at the edge); upstream services
  see AWS's IP instead of the user's. The privacy panel and SPEC say so.
- Rate-limited upstreams (crt.sh, some RDAP servers) now see bursts from one AWS IP; the
  concurrency cap and cache keep that small.
- `HEAD` returns the `GET` headers with an empty body; other methods get 403 from CloudFront
  (allowed methods GET/HEAD) or 405 from the handler if they reach it.
- Deploying is still a manual `cdk deploy IzanamiStack` (ADR-0005); GitHub Pages hosts no API.
