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

## Amendment 1 — 2026-11-18: no `no-mx` penalty for parked defensive registrations

Live `tudelft.com` is TU Delft's own defensive registration: it is delegated to `ns1/ns2.tudelft.nl` and hosted in TU Delft's AS1128, but has no MX or SPF and a different registrar. The original table scored it *Suspicious* (+5) because `no-mx` (+10) fired: a parked domain is expected to have no mail, so its absence is not a risk signal there.

- `no-mx` does **not** fire when the variant shares nameservers or registrar with the official domain (the same overlap tests as `same-nameservers` / `same-registrar`); it reports `not-fired` with that reason.
- `no-mx` still fires for variants without that overlap (e.g. a parked typo-squat on a parking provider).
- `fixtures/cases.json` models live `tudelft.com` (shared NS and ASN, different registrar, no MX/SPF) and expects *Likely legit* (score −5).

## Amendment 2 — 2026-11-19: `listed-related` instead of an Official short-circuit

Domains Wikidata lists as owned by the organisation used to count as official ([ADR-0002](0002-build-time-resolution.md) Amendment 2) and short-circuited to *Official*. Wikidata keeps dead acquisitions and investments, so a lapsed domain re-registered by an attacker would have read as Official ([ADR-0002](0002-build-time-resolution.md) Amendment 4).

- New rule `listed-related` (−30): fires when the variant is one of the org's Wikidata-listed related domains, with the summary "Listed by Wikidata as owned by Google (via YouTube)". It is an ordinary legit signal, never a short-circuit.
- −30 pulls a long-standing listed domain without other risk signals to *Likely legit*, but does not hide a fresh registration: `young-domain` (+40) + `not-in-tranco` (+10) + `fresh-cert` (+20) still give *Likely fraud* (+40).
- `official-match` now short-circuits only for the org's own sites, published-list and curated related domains, and brand TLDs.
