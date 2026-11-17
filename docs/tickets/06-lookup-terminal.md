# 06 — Lookup terminal & existence states

**Depends on:** 03, 04, 05

## Goal
The first end-to-end slice: type a variant, see live DNS + RDAP results and the existence state. No scoring yet.

## Scope
- Terminal-styled panel on the org page: monospace input prefilled with `<brandLabel>.`, TLD chips (org country ccTLD, `.com`, `.net`, `.org`, plus a few abuse-heavy ones), free editing.
- On submit: `parseVariant` → if official → show "Official domain" and stop.
- Otherwise run NS/A/AAAA/MX/TXT + RDAP in parallel (RDAP always, even on NXDOMAIN); print each result as terminal lines as it arrives.
- Existence state per [SPEC](../SPEC.md#existence-states): *Not registered* / *Registered, not resolving* / *Resolving*, with the agreed wording ("no active threat right now").
- Show Unicode and punycode forms; flag subdomain tricks ("you typed X, the registrable domain is Y").
- Deep link: `/#/org/:slug?d=<variant>` pre-fills and auto-runs; URL updates on submit.
- Show registrant only if unredacted.

## Acceptance criteria
- With `FixtureLookupClient`: NXDOMAIN + RDAP 404 → *Not registered*; RDAP found + no DNS → *Registered, not resolving*; DNS answers → *Resolving* with IP, registration date, registrar, MX.
- `unavailable` sources render as "couldn't check" lines, not errors.
- Opening a deep link runs the lookup without user action.
