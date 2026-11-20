# 21 — Lookup hardening: no caching of failures, size caps, redirects

**Status:** Done (15459c6)

**Depends on:** 18 · Security scan F2, F5

## Goal
Don't serve a degraded result from the edge for an hour, and don't trust upstream servers more than needed.

## Scope
- **No caching of transient failures:** `gatherFacts` already knows `transientFailure`; surface it through `startCheck` to the API. If any lookup failed transiently (timeout, 429, 5xx, network), respond `Cache-Control: no-store`, else keep `public, max-age=3600`. The overall deadline already gives `no-store`.
- **Response size cap:** read upstream bodies with a byte limit (DoH 64 KB, RDAP 512 KB, crt.sh 5 MB); over the limit → that fact is `unavailable`, not a crash.
- **Redirects:** `redirect: 'manual'` for upstream fetches; follow at most 2 redirects and only to `https:` URLs. Anything else → `unavailable`.
- **Validate DoH JSON shape** (`Status` number, `Answer` array of `{type, data}`); malformed → `unavailable`, never a thrown 500.
- Applies to the browser too (same `LookupClient`); behaviour there must not regress.

## Acceptance criteria
- Unit tests with fake `fetch`: oversized body, redirect to `http://127.0.0.1`, malformed DoH JSON; API test: a transient failure → `no-store`.
- A clean lookup still gets `max-age=3600`.
- lint, test, build pass; live check still returns Official for `c.gle`.
