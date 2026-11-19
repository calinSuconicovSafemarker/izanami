# 14 — Brand TLDs count as official

**Status:** Done (2106f51) — 77 brand TLDs across 39 orgs (Google 14)

**Depends on:** 15 (org data shape)

## Goal
Some organisations run their own top-level domain (Google: `.google`, `.goog`, `.gle`, `.youtube`; Microsoft: `.microsoft`; Apple: `.apple` …). Every domain under such a TLD belongs to that organisation, e.g. `c.gle`.

## Scope
- Build time: generate `brandTlds` per org. Source of truth: the IANA Root Zone Database (each TLD's page lists its sponsoring organisation / registry operator). Map registry operators to orgs (e.g. "Charleston Road Registry Inc." → Google) through a small curated mapping file with source links; only include TLDs whose operator is the org or a known subsidiary.
- Add `brandTlds: string[]` to the org data; show them on the org page ("Operates the TLDs .google, .gle …").
- Matching: a variant whose TLD is in the org's `brandTlds` short-circuits to **Official** (like `official-match`), explanation e.g. "Google operates the .gle top-level domain".

## Acceptance criteria
- `c.gle` and `about.google` → Official on Google's page; `c.gle` on another org's page → not official.
- Each mapping entry has a source URL; the data-diff report lists brand-TLD changes.
