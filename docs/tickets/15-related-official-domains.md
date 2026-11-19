# 15 — Related official domains (ownership graph + published lists)

**Status:** Done (9d0a658) — full ownership crawl completed (1,239 related domains; Google 228, Microsoft 121, Apple 18)

**Depends on:** —

## Goal
When you open Google, show the legitimate domains Google's staff and systems use (youtube.com, gmail.com, g.co, gstatic.com …), not just the google.* sites. No brute force: passive, sourced data only.

## Scope
- **Wikidata ownership graph** (all orgs): collect P856 of entities linked to the org via owned by (P127), parent organization (P749) and subsidiary (P355), one or two levels deep; normalise to registrable domains; skip domains already claimed by another org in `orgs.json`.
- **Vendor-published lists** (top brands, fetched at build time and cached): e.g. Google's supported domains list, the Microsoft 365 endpoints JSON. A small `scripts/data/published-lists.json` config (org → URL + parser) so more can be added.
- **Curated extras**: extend `scripts/data/extras.json` with `relatedDomains` + `source` (seed: Google `g.co`, `goo.gl`, `withgoogle.com`; Microsoft; Apple; PayPal; TU Delft).
- Org data gets `relatedDomains: { domain, source: "wikidata-owned" | "published-list" | "curated", via?: string }[]`. Official matching (`official-match`, similarity `isOfficial`) includes related domains.
- Org page: grouped list ("Own sites", "Products & subsidiaries", "Published by the company", "Curated"), collapsible when long, each with its source.
- data-diff report includes related-domain changes for human review.

## Acceptance criteria
- Google shows youtube.com and gmail.com (curated, with sources; also owned per Wikidata) and g.co (curated or published), each with a source.
- `youtube.com` typed on Google's page → Official.
- A domain appears under two orgs only through proven ownership: a related domain may be the official site of an org this one owns (youtube.com under Google and as YouTube's own entry), per Wikidata, a curated `owns` link or the company's own list ([ADR-0002](../adr/0002-build-time-resolution.md) Amendment 2). No other overlap. Build reproducible from cache; fixture-based tests, no network in CI.
