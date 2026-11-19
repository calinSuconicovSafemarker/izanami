# 19 — Replace Tranco with commercially licensed popularity data

**Status:** Done (41c3d05)

**Depends on:** 17 (licence research: `docs/research/licences.md`)

## Goal
Tranco is not cleared for commercial use (no licence; one of its inputs, Cloudflare Radar, is CC BY-NC 4.0). Replace it everywhere with popularity lists whose licences allow commercial use with attribution, so Izanami can be used at Safemarker.

## Scope
- **New sources** (verify each licence on the provider's own page first and record it in `docs/research/licences.md`):
  - **Majestic Million** (CC BY 3.0) — daily top 1M registrable domains by referring subnets. Exact rank.
  - **Chrome UX Report (CrUX)** top origins (CC BY 4.0 per Google) — rank *buckets* (top 1k / 10k / 100k / 1M …) by real Chrome traffic. Find a downloadable, license-clean source (e.g. a published monthly CSV derived from the public CrUX BigQuery dataset); BigQuery itself needs a Google account — only use it if there is no other way, and then ask the orchestrator first.
  - If CrUX can't be obtained cleanly, Majestic alone is acceptable; say so in the report.
- **One concept, "popularity":** combine the lists into one popularity signal per registrable domain: best bucket across sources (top 1k / 10k / 100k / 1M / not listed), keeping which source(s) listed it. Rename Tranco-specific code, types, data files and text to neutral names (`popularity`, `popularityBucket` …). No user-facing text may mention Tranco any more.
- **Everywhere Tranco is used today** (`scripts/src/lib/tranco.ts`, `scripts/src/datasets`, org selection `scripts/src/orgs/select.ts` and the pipeline/related/extras code, `web/src/data/tranco.ts` + the bundled top-100k Golomb set, rules/gather/weights/why, org card evidence "Tranco rank 1 — heavily used", verdict card, export `common.ts`/`lookup.ts`, credits `web/src/credits/sources.ts`): switch to the popularity data with the same intent:
  - Org selection: same goal (well-known orgs whose P856 domain is popular); thresholds expressed in buckets. Must still include the current flagship orgs (Google, Microsoft, Apple, Amazon, PayPal, TU Delft, …).
  - Runtime "variant is a popular site" check: bundled set of domains in the top-100k bucket (Golomb set as today, rebuilt from the new data).
  - Related-domain filters that required a Tranco rank: use "listed in popularity data".
- **Build:** cache the new downloads in `scripts/.cache/` like the rest; `BUILD_DATA_OWNERSHIP=cache-only` still works for Wikidata. Regenerate `orgs.json` and the runtime set; `data-diff.md` lists orgs added/removed.
- **Docs:** SPEC, GLOSSARY ("Tranco confirmation" → "Popularity confirmation"), ADR-0002 amendment (why the switch), credits page entries with the exact attribution each licence asks for (CC BY: name, link, licence link, note changes), licence research table updated (Tranco row → replaced).

## Acceptance criteria
- `grep -ri tranco` finds nothing in `web/src` or `scripts/src` except a historical note in docs/ADR/research.
- Credits page and JSON `sources` list Majestic (and CrUX if used) with correct CC BY attribution.
- Flagship orgs still present; data-diff reviewed and reported (counts added/removed, notable examples).
- Rules behave the same on the fixture cases (popular official domain, unknown fresh lookalike, etc.). lint, test, build, synth pass.
