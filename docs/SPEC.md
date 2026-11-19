# Izanami — Lookalike Domain Checker Spec

A static website that helps someone check whether a domain is the **official** domain of a well-known organisation, or a **lookalike** that might be used for phishing. It only uses passive, public lookups (DNS, RDAP, Certificate Transparency) — no probing, scanning or contacting the domain's own servers.

Personal learning + CV project. TypeScript end to end. Hosted on GitHub Pages ([ADR-0005](adr/0005-github-pages-hosting.md); AWS S3 + CloudFront remains an optional alternative), **browser-only at runtime** (see [ADR-0001](adr/0001-browser-only-runtime.md)).

Terms are defined in [GLOSSARY.md](GLOSSARY.md).

## User flow

1. **Landing page** — searchable grid of ~500 organisations (search by name or domain).
2. **Organisation page** (`/#/org/<slug>`) — an *official-domain card*:
   - primary domain + all known official domains;
   - brand TLDs the organisation operates ("Operates the TLDs .google, .gle …"), each linked to its IANA record;
   - evidence: "Wikidata lists this as the official website (P856)" + "Tranco rank N (heavily used)" + `confirmedAt` date.
   - Honest wording: Wikidata says official + Tranco says heavily used. This is **not** proof of ownership.
3. **Lookup terminal** — monospace panel, brand label prefilled (`tudelft.`), TLD quick-pick chips, free editing allowed (typos, combo-squats, IDN). Deep link `/#/org/<slug>?d=<variant>` auto-runs the lookup.
4. **Results** — raw DNS/RDAP lines in terminal style, then a **verdict card** listing every rule as *fired / not fired / unknown* with a plain-English line each.

## Input handling

- Always normalise to the **registrable domain** via the Public Suffix List (`tudelft.nl.evil.com` → `evil.com`, flagged as subdomain trick).
- Show the variant in both Unicode and punycode.
- If the variant matches any **known official domain**, or sits under a **brand TLD** the organisation operates (`c.gle` for Google) → verdict **Official**, no further scoring.
- If the variant bears no similarity to the brand → "not a lookalike of <Org>" (lookup still allowed, scored without the `brand-lookalike` rule: it is reported *not applicable* and left out of the score and the unknown share).

## Lookup pipeline (all from the browser)

| Step | Source | Notes |
|---|---|---|
| Existence | DoH (Cloudflare JSON, Google fallback): NS, A, AAAA, MX, TXT(SPF) | NXDOMAIN = `Status:3` |
| Registration | RDAP via IANA bootstrap → registry server (rdap.org as fallback) | Always queried, even on NXDOMAIN. 404 = not registered |
| ASN | DoH TXT `<reversed-ip>.origin.asn.cymru.com` | Failure → `same-asn` unknown |
| Cert history | crt.sh JSON (optional) | Timeout ~5 s; failure → `fresh-cert` unknown |
| Official domain's own NS/MX/registrar/ASN | Same sources, queried live for comparison | Cached per session |
| Variant popularity | Bundled Tranco top-100k set | No runtime call |

All network access goes through one `LookupClient` interface so rules and UI are testable with recorded fixtures.

### Existence states

| State | Condition | Wording |
|---|---|---|
| **Not registered** | DoH NXDOMAIN **and** RDAP 404 | "Not registered — no active threat right now." |
| **Registered, not resolving** | RDAP finds it, DNS has no usable records (A, AAAA or MX; NS-only delegation does not count) | "Registered but not live yet — worth watching." (scored, see `registered-not-resolving`) |
| **Resolving** | DNS answers with A, AAAA or MX | Full details + scoring |

## Rules engine

Each rule is a pure function `(variant: VariantFacts, official: OfficialFacts) → { id, status: 'fired'|'not-fired'|'unknown'|'not-applicable', weight, explanation, summary }`. `summary` is a short phrase with the concrete value ("Registered 12 days ago"); `whyList(facts)` picks the top fired rules by |weight| (max 4; for Insufficient data, what couldn't be checked; none for Official / Not registered) for the "Why" list under the verdict. Weights live in one config file (`web/src/rules/weights.ts`). Positive = riskier, negative = more legit. Full rationale in [ADR-0003](adr/0003-scoring-model.md).

| Rule | Fires when | Weight |
|---|---|---|
| `official-match` | variant ∈ known official domains (own sites + published-list and curated related domains), or its TLD ∈ the org's brand TLDs ("Google operates the .gle top-level domain") | short-circuit → **Official** |
| `listed-related` | variant is a related domain Wikidata lists as owned by the org ("Listed by Wikidata as owned by Google (via YouTube)"); never a short-circuit, every other rule still runs ([ADR-0003](adr/0003-scoring-model.md) Amendment 2) | −30 |
| `young-domain` | registered < 90 days ago | +40 |
| `much-newer` | registered > 5 years after official (and not `young-domain`) | +15 |
| `brand-lookalike` | edit distance ≤ 2 / contains brand label | +25 |
| `brand-lookalike` (homoglyph/punycode) | confusables skeleton matches brand | +35 |
| `not-in-tranco` | registrable domain not in bundled top-100k | +10 |
| `same-nameservers` | shares an NS host/provider with official | −40 |
| `same-registrar` | same registrar as official (brand registrars like MarkMonitor/CSC weigh extra) | −25 |
| `same-mx` | shares MX provider with official | −15 |
| `same-asn` | shares hosting ASN with official | −15 |
| `no-mx` | resolves but no MX and no SPF — not when it shares nameservers or registrar with official (parked defensive registration) | +10 |
| `mail-ready` | has MX + SPF but no shared infra | +15 |
| `fresh-cert` | first CT cert < 30 days ago (optional) | +20 |
| `registered-not-resolving` | watch state | +20 |
| `odd-tld` | TLD neither the org's country ccTLD nor a legacy generic TLD, and in the abuse-heavy list (`web/src/tld/lists.ts`) | +10 |

**Verdict**: ≤ 0 → *Likely legit*; 1–39 → *Suspicious*; ≥ 40 → *Likely fraud*. If more than half of the applicable rules' absolute weight is `unknown` → *Insufficient data*. Unknown rules are always shown, never hidden.

Owner (registrant) is displayed only when RDAP returns it unredacted; it is not a scoring input (GDPR redaction makes it almost always absent).

## Build-time data (`/scripts`, `npm run build:data`)

Outputs committed to `web/src/data/`:

- `orgs.json` — ~500 orgs: `{ slug, name, wikidataId, country, primaryDomain, officialDomains[], relatedDomains[], brandTlds[], wikidataDomain, trancoRank, confirmedAt }`. A related domain's `source` sets its trust level: `published-list` and `curated` are *Official*, `wikidata-owned` is *listed, verified at lookup* ([ADR-0002](adr/0002-build-time-resolution.md) Amendment 4). Countries and administrative regions are never organisations. Generated from Wikidata entities with P856 whose registrable domain is in Tranco top ~10k; top 500 by rank. An org is included only when **both** sources agree ([ADR-0002](adr/0002-build-time-resolution.md)).
- `extras.json` (hand-curated input, e.g. TU Delft `Q752663`) — exempt from the Tranco check, each entry must cite a source.
- `tranco-top100k` — compact set: sorted 32-bit FNV-1a hashes, Golomb-Rice coded (~207 KB gzipped). No false negatives; false-positive rate ≈ n/2³² ≈ 2.3e-5.
- `confusables.json` — Latin/Cyrillic/Greek subset of Unicode `confusables.txt`.
- `rdap-hosts.json` — RDAP server hosts from the IANA bootstrap, used for the CSP `connect-src` allowlist.
- `data-diff.md` — human-reviewed report of official domains, related domains and brand TLDs that changed since the last build.

## Hosting & security ([ADR-0004](adr/0004-security-headers.md))

- CDK (TypeScript): private S3 bucket + CloudFront with Origin Access Control, default CloudFront domain for now.
- `ResponseHeadersPolicy`: strict CSP (generated `connect-src` allowlist), HSTS, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`. Target: Mozilla Observatory A+.
- Hash routing → no SPA rewrite config needed.
- GitHub Actions deploy via OIDC (no long-lived keys).

## Privacy

- No backend, no analytics, no logging by us.
- A "What this tool sends where" panel lists every third party a lookup contacts.
- Disclaimer: "Heuristic, not a guarantee. Passive public lookups only."

## UI

Dark by default, mobile-first, keyboard-accessible, Tailwind (no component library). Terminal-styled lookup panel.

## Export

Client-side downloads only (Blob + `a[download]`, no network, CSP unchanged); builders in `web/src/export/`. File names: `izanami-<registrable domain | scan-<org slug>>-<yyyymmdd-hhmm UTC>.<json|csv>`.

**Single lookup**: "Export JSON" / "Export CSV" on the verdict card once the lookup is done (also for an official domain, and below the terminal for a not-registered result). JSON (`schemaVersion: 1`; a breaking change bumps it):

| Key | Content |
| --- | --- |
| `schemaVersion`, `tool` (`"izanami"`), `kind` (`"lookup"`), `exportedAt`, `checkedAt` | ISO 8601 times; `checkedAt` is `null` for an official domain (no lookups) |
| `org` | `{slug, name, primaryDomain, officialDomains, relatedDomains, brandTlds}` |
| `variant` | `{input, unicode, punycode, registrableDomain}` |
| `analysis` | `{technique, techniqueLabel, editDistance, similarityPercent (0–100), homoglyphs: [{text, looksLike, codePoints}], inTrancoTop100k}` |
| `existence` | `not-registered` \| `registered-not-resolving` \| `resolving` \| `null` |
| `registration` | `{registrationDate, registrar, firstCertDate}` (`firstCertDate: "none"` = no certificate ever logged) |
| `dns`, `hosting` | `{nameservers, mx, addresses, spf}`, `{asns}` |
| `official` | facts of the org's primary domain it was compared with: `{domain, registrationDate, registrar, nameservers, mx, addresses, asns}` |
| `verdict` | `{label, score, unknownShare}`; `null` for a not-registered variant |
| `why` | the "Why" list: `[{id, kind, weight, summary}]` |
| `rules` | every rule in display order: `[{id, status, weight, summary, explanation}]` |

A fact that could not be looked up is `null`; `registration`, `dns`, `hosting` and `official` are `null` for an official domain. CSV: one row per rule; every row repeats `domain, unicode, org, existence, verdict, score, unknown_share, checked_at`, then `rule_id, rule_status, rule_weight, rule_summary, rule_explanation`.

**Lookalike scan**: "Export JSON" / "Export CSV" once the results table has rows. JSON: `{schemaVersion, tool, kind: "lookalike-scan", exportedAt, org, scan: {status, total, checked, registered}, candidates: [{domain, display, technique, techniqueLabel, tld, tldRating, tldCategory, exists, nameservers, checkedAt}]}` (`checked < total` for a cancelled scan). CSV columns: `candidate, domain, technique, tld, tld_rating, exists, checked_at`.

CSV follows RFC 4180 (CRLF, quoting, doubled quotes), starts with a UTF-8 BOM for Excel, and prefixes text cells starting with `= + - @` (or tab/CR) with `'` against formula injection.

## Repo layout

```
/web        Vite + React + TS + Tailwind + Vitest
/scripts    build-time data generator (Node + TS)
/infra      AWS CDK (TS)
/lambda     (backlog only)
/docs       SPEC, GLOSSARY, adr/, tickets/
```

## Testing

- Vitest. Rules: table-driven tests per rule. Lookup client: recorded JSON fixtures, no live network in CI.
- One optional live smoke test (`npm run test:live`), not in CI.
- A `fixtures/cases.json` of real-world examples (official, defensive registration, known lookalikes) to tune weights.

## Out of scope (for now)

- Any server-side component (see backlog ticket B1).
- Active probing: HTTP fetches of the variant, screenshots, port scans.
- Custom domain.
