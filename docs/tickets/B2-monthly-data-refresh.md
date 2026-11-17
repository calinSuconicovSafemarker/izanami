# B2 — (Backlog) Monthly data refresh Action

**Depends on:** 01, 02, 10

## Goal
Keep `orgs.json` and datasets fresh without silently trusting Wikidata edits.

## Scope ideas
- Scheduled GitHub Action (monthly) runs `npm run build:data` and opens a PR when outputs change.
- PR body = `data-diff.md`; a human reviews changed official domains before merging ([ADR-0002](../adr/0002-build-time-resolution.md)).
- Fail loudly if more than N official domains change at once (possible vandalism or upstream breakage).
