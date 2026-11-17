# ADR-0002: Resolve official domains at build time, require both sources to agree

Status: Accepted — 2026-11-17

## Context

The site shows a confirmed official domain for ~500 organisations. Candidate sources: Wikidata P856 (official website) and Tranco (popularity rank). Fortune lists are copyrighted and company-only.

Wikidata is openly editable, so a vandalised P856 could make a phishing domain look official. Tranco shows popularity, not ownership.

## Decision

- A build script (`npm run build:data`) generates `orgs.json`: Wikidata entities with P856 whose registrable domain is in Tranco top ~10k, top 500 by rank.
- An organisation is included only when its Wikidata domain also has a Tranco rank.
- All P856 values become the organisation's known official domains; the best-ranked one is primary.
- Hand-curated `extras.json` (e.g. TU Delft, `Q752663`) is exempt from the Tranco requirement but must cite a source.
- Each build writes `data-diff.md` listing changed official domains; a human reviews it before committing.
- The UI wording is "Wikidata lists this as official + Tranco shows it is heavily used", never "proven".
- Refresh is manual for now; a monthly PR-opening Action is backlog ticket B2.

## Consequences

- No runtime dependency on Wikidata/Tranco; instant page load.
- Data can go stale between rebuilds; `confirmedAt` is shown.
- Organisations whose official domain is unpopular are excluded unless added as extras.
