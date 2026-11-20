# 23 — Infra hygiene (headers, runtime, logs, cdk-nag in CI)

**Status:** Open

**Depends on:** 09, 18 · Security scan F6–F10

## Scope
- Remove `x-amzn-requestid` and `x-amzn-trace-id` via the response-headers policy `removeHeaders`.
- API Lambda runtime → Node.js 24 (latest Lambda Node runtime) if available in eu-north-1; keep the `esbuild` target in sync.
- Access logs: CloudFront standard logging to a private, encrypted S3 log bucket with 30-day expiry (cheap; enough to investigate abuse). S3 server access logs for the site bucket to the same log bucket.
- Frame-busting on the GitHub Pages copy: in the app bundle (CSP forbids inline scripts), if `window.top !== window.self` don't render the app; show a link to open IZANAMI directly instead.
- `aws-cdk-lib` → latest 2.x if it clears the `minimatch` advisory; otherwise record as accepted (build-time only).
- Add cdk-nag (`AwsSolutionsChecks`) as an infra test so new findings fail CI; suppress the accepted ones (TLS on default cert, geo restriction, CDK BucketDeployment wildcards, basic execution role, WAF pending ticket 20) with written reasons.

## Acceptance criteria
- Live `/api/health` response has no `x-amzn-*` headers.
- Logs appear in the log bucket after a request; bucket is private, encrypted, expires objects.
- The app inside an `<iframe>` doesn't render (unit test).
- cdk-nag test passes with only documented suppressions; lint, test, build, synth pass.
