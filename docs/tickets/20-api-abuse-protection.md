# 20 — API abuse protection (cache key + rate limit)

**Status:** Partly done — canonical cache key done; WAF and concurrency quota are open decisions (ADR-0006 Amendment 1)

**Depends on:** 18 · Security scan F1 (`docs/security/2026-11-20-security-scan.md`)

## Goal
About 10 parallel slow requests can use up the account's 10 concurrent Lambda executions and throttle the API (and CDK's deploy Lambda). Make repeat traffic hit the CloudFront cache, and decide how to rate-limit the rest.

## Scope
- **Canonical cache key (free):** CloudFront Function (viewer-request, `/api/*`) that rewrites the query string before the cache key is computed: keep only `org` and `domain` (first value each), trim whitespace, lowercase both, strip trailing dots from `domain`. `GOOGLE.com`, `google.com.` and ` google.com` then share one cache entry. Don't reduce subdomains (the analysis differs) and don't do punycode in the function (rare; the Lambda still normalises).
- **Lambda side:** the API's own validation stays authoritative; add tests that the handler gives the same result for the variants above.
- **Rate limiting (decision, may cost money):** AWS WAF rate-based rule on `/api/*` (e.g. 100 requests / 5 min per IP). Standalone WAF ≈ $5/month web ACL + $1/rule + $0.60/M requests (paid from credits until 2027-05). CloudFront's flat-rate plans (including a $0 Free plan) bundle WAF, but whether the Free plan includes rate-based rules and whether this account can join one must be checked first. **Ask the user before adding anything billable.**
- **Concurrency:** request a Lambda concurrent-executions quota increase (free, Service Quotas) so `reservedConcurrentExecutions` can cap the API without starving other functions. Needs the user (account action).
- Docs: ADR-0006 amendment (caching + abuse limits), SPEC API section.

## Acceptance criteria
- `GOOGLE.com`, `google.com.` and `%20google.com` against the live API: the 2nd and 3rd are `x-cache: Hit from cloudfront` after the 1st.
- Extra query parameters don't create new cache entries.
- CDK assertion test for the function association on `/api/*`; unit test of the function's rewrite logic.
- WAF/quota: either done with the user's OK or recorded as an open decision in the ADR.
