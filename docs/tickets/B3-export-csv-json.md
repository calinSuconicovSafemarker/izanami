# B3 — (Later) Export results to CSV / JSON

**Depends on:** 12, 13, 15, 16 (decide the result shape once those land)

## Goal
Mentor asked for an export button. Design the exported shape after the new result content is settled.

## Scope ideas
- Client-side download (Blob + `a[download]`), no server; CSP-compatible.
- Single lookup → JSON (facts, rules, verdict, analysis) and CSV.
- Lookalike scan → CSV/JSON of all candidates.
