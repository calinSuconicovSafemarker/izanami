# 17 — Credits and licences for every data source and service

**Depends on:** — (content from the licence research, `docs/research/licences.md`)

## Goal
Credit everyone Izanami uses, and know whether each one allows **commercial use** (Safemarker may use the tool or the API at work).

## Scope
- **Research first** (`docs/research/licences.md`): for every build-time dataset, runtime service and bundled library, record: licence / terms (with link and the date read), commercial use allowed? (yes / no / unclear), attribution required and its exact wording, rate limits or usage policy, and whether *server-side* use (the API, ticket 18) changes anything. Sources include at least: Wikidata, Tranco (and the lists it aggregates), IANA (RDAP bootstrap, root zone database), ICANN (Spec 13 .brand list), Mozilla Public Suffix List, Unicode confusables, Google supported_domains, Microsoft 365 endpoints, Cloudflare DNS-over-HTTPS, Google Public DNS, Team Cymru IP-to-ASN, crt.sh (Sectigo), rdap.org and registry RDAP servers, plus the npm runtime dependencies (summary by licence).
- **Credits page** in the site (`#/credits`, linked from the footer): grouped "Data used to build the org list", "Live lookups", "Software", each entry with name + link, what we use it for, licence, and the attribution text where required. Short note that results are heuristics and the sources don't endorse Izanami.
- Where a licence requires it, also carry attribution in the exported JSON/CSV and API output (`attribution` / `sources` field).
- Anything **not OK for commercial use** or **unclear**: flag it on the research page with a recommendation (replace, ask the provider, or keep for personal/non-commercial use only). Do not silently drop features.

## Acceptance criteria
- Every source used in `scripts/` and `web/src/lookup/` appears on the credits page and in the research file, each with a link to its terms.
- Required attribution wording is used verbatim.
- The research file has a summary table: source → commercial use (yes/no/unclear) → attribution needed → action.
- Page passes the existing a11y test pattern; lint, test, build pass.
