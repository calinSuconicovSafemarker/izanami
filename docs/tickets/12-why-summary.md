# 12 — "Why" summary under the verdict

**Status:** Done (049ec5c)

**Depends on:** —

## Goal
The mentor asked that results explain *why* a domain is suspicious, not just its risk level. Put the reasons first.

## Scope
- Directly under the verdict label in `VerdictCard`, a short "Why" list: the top fired signals (risk and legit), ordered by absolute weight, max ~4 bullets, each a short plain-English phrase with the concrete value (e.g. "Registered 12 days ago", "Shares Google's nameservers", "Uses look-alike letters (Cyrillic е)").
- Each rule gets a `summary` (short phrase) in addition to its existing longer `explanation`; produce it in `web/src/rules/` so the UI stays dumb.
- Insufficient data: the Why list names what couldn't be checked.
- Full rule list stays below, unchanged.

## Acceptance criteria
- For every `cases.json` case the Why list matches the top fired rules by |weight| (unit test).
- No Why list for Official / Not registered.
- Screen readers read the Why list after the verdict.
