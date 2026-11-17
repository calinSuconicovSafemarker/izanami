# ADR-0003: Weighted additive scoring with explicit unknowns

Status: Accepted — 2026-11-17

## Context

We need an explainable verdict for a resolving or registered variant. Registrant data is almost always redacted by RDAP (GDPR; .com has no registrant at all), so "different owner" cannot be a core signal. Registration date and registrar are always present.

## Decision

- Each rule is a pure function returning `fired | not-fired | unknown`, a weight and a plain-English explanation.
- Risk signals have positive weights; legit signals (infrastructure overlap with the official domain) have negative weights.
- "Different owner" is replaced by infrastructure-overlap rules: same nameservers, registrar, MX provider, ASN.
- `official-match` short-circuits to *Official*.
- Thresholds: ≤ 0 Likely legit, 1–39 Suspicious, ≥ 40 Likely fraud.
- If more than half of the applicable absolute weight is `unknown`, the verdict is *Insufficient data*.
- Unknown rules are always displayed, never silently skipped — hiding a check that could not run would mislead a security user.
- Weights live in one config file; the starting table is in [SPEC.md](../SPEC.md#rules-engine).
- ASN via Team Cymru's DNS TXT service over DoH; homoglyphs via a bundled confusables subset.

## Consequences

- Easy to explain, test (table-driven) and tune against `fixtures/cases.json`.
- Additive weights ignore interactions between signals; acceptable for v1.
