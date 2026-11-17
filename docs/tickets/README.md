# Tickets

Run one at a time (e.g. with `/implement`). Each ticket lists its dependencies; tickets with no unmet dependencies can be done in any order.

| # | Ticket | Depends on |
|---|---|---|
| 00 | [Scaffold monorepo](00-scaffold-monorepo.md) | — |
| 01 | [Org list generator](01-org-list-generator.md) | 00 |
| 02 | [Static lookup datasets](02-static-lookup-datasets.md) | 00 |
| 03 | [Domain parsing & similarity](03-domain-parsing-similarity.md) | 00, 02 |
| 04 | [LookupClient](04-lookup-client.md) | 00 |
| 05 | [Org list & org page UI](05-org-pages-ui.md) | 00, 01 |
| 06 | [Lookup terminal & existence states](06-lookup-terminal.md) | 03, 04, 05 |
| 07 | [Rules engine & verdict](07-rules-engine.md) | 02, 03, 04 |
| 08 | [Verdict card UI](08-verdict-card-ui.md) | 06, 07 |
| 09 | [AWS infrastructure (CDK)](09-aws-infra.md) | 00, 02 |
| 10 | [CI/CD deploy via OIDC](10-ci-cd-deploy.md) | 09 |
| 11 | [Privacy panel, disclaimer, a11y polish](11-privacy-polish.md) | 05 |

Suggested order: 00 → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11.
First runnable slice (no scoring): after 06.

## Backlog (optional)

| # | Ticket |
|---|---|
| B1 | [Lambda proxy with caching](B1-lambda-proxy.md) |
| B2 | [Monthly data refresh Action](B2-monthly-data-refresh.md) |

Spec: [../SPEC.md](../SPEC.md) · Glossary: [../GLOSSARY.md](../GLOSSARY.md) · ADRs: [../adr/](../adr/)
