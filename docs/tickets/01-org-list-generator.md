# 01 — Org list generator

**Depends on:** 00

## Goal
`npm run build:data` produces `web/src/data/orgs.json` as described in [ADR-0002](../adr/0002-build-time-resolution.md).

## Scope
- Download the Tranco top-1M list (zip, Node side) and take top ~10k registrable domains.
- Query Wikidata SPARQL for entities with P856 (official website), plus label, country (P17 → ISO code). Batch politely, set a descriptive User-Agent without personal data.
- Normalise P856 URLs to registrable domains (PSL), dedupe (`https://www.tudelft.nl/`, `/en/`, `http://…` → `tudelft.nl`).
- Include an org only if a P856 registrable domain has a Tranco rank; primary = best-ranked; `officialDomains` = all.
- Take top 500 by rank; generate stable `slug`s.
- Merge `scripts/data/extras.json` (hand-curated; each entry has `source` URL). Seed it with TU Delft (`Q752663`, `tudelft.nl`).
- Write `orgs.json` with `{ slug, name, wikidataId, country, primaryDomain, officialDomains, wikidataDomain, trancoRank, confirmedAt }`.
- Write `web/src/data/data-diff.md` comparing with the previous `orgs.json` (added/removed orgs, changed official domains).

## Acceptance criteria
- `orgs.json` has 500 ± a few entries plus extras; TU Delft present with `tudelft.nl` primary.
- An entity whose P856 domain has no Tranco rank is excluded (unit test with a stub).
- Re-running with unchanged inputs produces an empty diff.
- Network fetches isolated behind small functions; transformation logic unit-tested with fixtures.
