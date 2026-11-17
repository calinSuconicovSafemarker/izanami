# 08 — Verdict card UI

**Depends on:** 06, 07

## Goal
Show the verdict and every rule's outcome under the terminal output.

## Scope
- Verdict card: verdict label with colour + icon (not colour alone), total score, one-sentence summary.
- Rule list grouped: *Risk signals fired*, *Legit signals fired*, *Couldn't check* (unknown), *Not fired* (collapsed). Each shows weight and explanation.
- *Insufficient data* explains which sources failed.
- Card updates as slow sources (crt.sh, ASN) arrive; show "still checking…" for pending rules.

## Acceptance criteria
- For each `cases.json` case (via fixture client), the rendered verdict matches the engine output.
- Unknown rules are always visible.
- Screen reader announces the final verdict (aria-live).
