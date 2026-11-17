# 05 — Org list & org page UI

**Status:** Done (76e0820)

**Depends on:** 00, 01

## Goal
Landing page with searchable organisations and an organisation page showing the official-domain card.

## Scope
- Route `/#/` — grid of orgs from `orgs.json`, search box filtering by name or domain (client-side, instant).
- Route `/#/org/:slug` — official-domain card: name, primary domain, other known official domains, evidence lines:
  - "Wikidata lists this as the official website (P856)" with link to the Wikidata item
  - "Tranco rank N — heavily used" (or "Curated entry — source: …" for extras)
  - "Confirmed at <confirmedAt>"
- Never use the words "proven" or "verified owner".
- Unknown slug → friendly 404 with link home.
- Placeholder area where the lookup terminal (06) will go.

## Acceptance criteria
- Searching "delft" shows TU Delft; clicking opens `/#/org/tu-delft` (or generated slug).
- Works at 375 px width; keyboard: `/` focuses search, Enter opens first result.
- Component tests with Vitest + Testing Library.
