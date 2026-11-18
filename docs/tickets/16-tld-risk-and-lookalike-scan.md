# 16 — TLD risk rating and lookalike scan

**Depends on:** —

## Goal
Mentor: "extra checks for each TLD (.com, .fr …) so we don't pick suspicious ones". Two parts: rate each TLD, and scan the brand across TLDs and common typos in one go.

## Scope
- **TLD rating** (`web/src/tld/`): classify a TLD as `official` (in the org's domains), `country` (ccTLD, with country name), `generic` (.com/.net/.org …), `brand` (single-owner TLD) or `high-abuse` (cheap TLDs commonly abused — curated config with a source note). Show the rating as a badge on each TLD chip and in the lookup output.
- Quick-pick chips: prefer the org's country TLD and generic TLDs; mark high-abuse chips visibly instead of presenting them as neutral.
- **Lookalike scan** button on the org page: generate a bounded candidate set (≤ ~150) — brand label × common TLDs plus typo permutations (omission, repetition, adjacent swap, keyboard-adjacent replacement, homoglyph, hyphenation, combo words like login/secure/support) — dnstwist-style, as a pure function in `web/src/domain/permutations.ts`.
- Existence via DoH NS queries only, client-side, concurrency-limited (e.g. 4 parallel, small delay) to stay polite. Results table: candidate, technique, TLD rating, exists?, and a "Check" link opening the full lookup (deep link `?d=`).
- UI note: passive DNS lookups only.

## Acceptance criteria
- Permutation generator unit-tested (deterministic, bounded, no duplicates, excludes official domains).
- Scan uses the fixture client in tests; concurrency limit tested.
- Each TLD chip shows its rating; high-abuse TLDs are visually distinct and labelled (not by colour alone).
