# 07 — Rules engine & verdict

**Status:** Done (b16c144)

**Depends on:** 02, 03, 04 (result types + fixtures)

## Goal
Pure, tested scoring per [ADR-0003](../adr/0003-scoring-model.md).

## Scope
- `gatherFacts(variant, org, client)` → `{ variantFacts, officialFacts }` (official's NS/registrar/MX/ASN/registration fetched once and cached).
- Rules from the [SPEC table](../SPEC.md#rules-engine), each a pure function returning `{ id, status, weight, explanation }`. Explanations are plain English and mention concrete values ("Registered 12 days ago; tudelft.nl was registered in 1987").
- `weights.ts` holds all weights, thresholds, brand-registrar list (MarkMonitor, CSC, …), abuse-heavy TLD list.
- `verdict(results)` → *Official* / *Likely legit* / *Suspicious* / *Likely fraud* / *Insufficient data* (> 50 % of applicable absolute weight unknown).
- `fixtures/cases.json`: at least 8 real-world style cases (official, defensive registration sharing NS, fresh lookalike with MX, parked squat, homoglyph, registered-not-resolving, all-unknown) with expected verdicts.

## Acceptance criteria
- Table-driven test per rule covering fired / not-fired / unknown.
- All `cases.json` cases produce the expected verdict.
- Rules have no network or DOM access (enforced by import boundaries or lint rule).
