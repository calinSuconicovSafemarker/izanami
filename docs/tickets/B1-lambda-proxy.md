# B1 — (Backlog) Lambda proxy with caching

**Depends on:** 09, 04

## Goal
Optional server-side component for the AWS/CV story and better reliability, without changing the browser-only default ([ADR-0001](../adr/0001-browser-only-runtime.md)).

## Scope ideas
- Lambda (Node/TS) behind CloudFront at `/api/*`: live Tranco rank and crt.sh with DynamoDB or CloudFront caching.
- Strict input validation (single registrable domain), allowlisted upstreams only — must not be an open proxy.
- WAF rate-based rule; CloudWatch alarms; cost guardrail (budget alert).
- `LookupClient` gains a `ProxyLookupClient` used only when configured.
- New ADR superseding the relevant part of ADR-0001.
