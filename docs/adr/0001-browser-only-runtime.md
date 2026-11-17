# ADR-0001: Browser-only runtime, no Lambda

Status: Accepted — 2026-11-17

## Context

The original plan assumed RDAP/WHOIS, Wikidata or Tranco might block browser calls (CORS), which would need an AWS Lambda proxy. We tested each endpoint on 2026-11-17 with `Origin: https://example.cloudfront.net`:

| Endpoint | CORS from any origin | Notes |
|---|---|---|
| cloudflare-dns.com/dns-query (JSON) | yes | no preflight; NXDOMAIN = `Status:3` |
| dns.google/resolve | yes | |
| rdap.org → registry redirect | yes (both hops) | 302 carries ACAO |
| rdap.verisign.com, rdap.sidn.nl, rdap.centralnic.com, rdap.identitydigital.services | yes | 404s also carry ACAO; registrant redacted/absent; `registration` event present |
| data.iana.org/rdap/dns.json | yes | 71 KB |
| query.wikidata.org/sparql | yes | |
| wikidata.org/w/api.php | yes, with `origin=*` | |
| tranco-list.eu/api/ranks/domain | partial | ~1 req/s; 429s have no ACAO |
| tranco-list.eu top-1m zip | no | 9.7 MB |
| crt.sh JSON | yes | slow (~2 s), flaky |

## Decision

- No server-side component. The site is static files on S3 + CloudFront.
- Official domains are resolved at build time ([ADR-0002](0002-build-time-resolution.md)), so Wikidata and the Tranco zip are only used by the Node build script, where CORS does not apply.
- The runtime "is the variant in Tranco?" check uses a bundled top-100k set instead of the rate-limited rank API.
- DoH, RDAP and crt.sh are called directly from the browser.

## Consequences

- Simpler, cheaper, nothing to secure or rate-limit on our side; no logging of user queries.
- Each user's browser hits public services directly, which the privacy panel must disclose.
- Tranco membership is as fresh as the last data build.
- A Lambda proxy remains as an optional backlog ticket (B1) for caching or CV value.
