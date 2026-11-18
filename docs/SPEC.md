# Izanami — Lookalike Domain Checker Spec

A static website that helps someone check whether a domain is the **official** domain of a well-known organisation, or a **lookalike** that might be used for phishing. It only uses passive, public lookups (DNS, RDAP, Certificate Transparency) — no probing, scanning or contacting the domain's own servers.

Personal learning + CV project. TypeScript end to end. Hosted on AWS (S3 + CloudFront), **browser-only at runtime** (see [ADR-0001](adr/0001-browser-only-runtime.md)).

Terms are defined in [GLOSSARY.md](GLOSSARY.md).

## User flow

1. **Landing page** — searchable grid of ~500 organisations (search by name or domain).
2. **Organisation page** (`/#/org/<slug>`) — an *official-domain card*:
   - primary domain + all known official domains;
   - evidence: "Wikidata lists this as the official website (P856)" + "Tranco rank N (heavily used)" + `confirmedAt` date.
   - Honest wording: Wikidata says official + Tranco says heavily used. This is **not** proof of ownership.
3. **Lookup terminal** — monospace panel, brand label prefilled (`tudelft.`), TLD quick-pick chips, free editing allowed (typos, combo-squats, IDN). Deep link `/#/org/<slug>?d=<variant>` auto-runs the lookup.
4. **Results** — raw DNS/RDAP lines in terminal style, then a **verdict card** listing every rule as *fired / not fired / unknown* with a plain-English line each.

## Input handling

- Always normalise to the **registrable domain** via the Public Suffix List (`tudelft.nl.evil.com` → `evil.com`, flagged as subdomain trick).
- Show the variant in both Unicode and punycode.
- If the variant matches any **known official domain** → verdict **Official**, no further scoring.
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

Each rule is a pure function `(variant: VariantFacts, official: OfficialFacts) → { id, status: 'fired'|'not-fired'|'unknown', weight, explanation }`. Weights live in one config file (`web/src/rules/weights.ts`). Positive = riskier, negative = more legit. Full rationale in [ADR-0003](adr/0003-scoring-model.md).

| Rule | Fires when | Weight |
|---|---|---|
| `official-match` | variant ∈ known official domains | short-circuit → **Official** |
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
| `odd-tld` | TLD not in {org country ccTLD, common gTLDs} and in the abuse-heavy list | +10 |

**Verdict**: ≤ 0 → *Likely legit*; 1–39 → *Suspicious*; ≥ 40 → *Likely fraud*. If more than half of the applicable rules' absolute weight is `unknown` → *Insufficient data*. Unknown rules are always shown, never hidden.

Owner (registrant) is displayed only when RDAP returns it unredacted; it is not a scoring input (GDPR redaction makes it almost always absent).

## Build-time data (`/scripts`, `npm run build:data`)

Outputs committed to `web/src/data/`:

- `orgs.json` — ~500 orgs: `{ slug, name, wikidataId, country, primaryDomain, officialDomains[], wikidataDomain, trancoRank, confirmedAt }`. Generated from Wikidata entities with P856 whose registrable domain is in Tranco top ~10k; top 500 by rank. An org is included only when **both** sources agree ([ADR-0002](adr/0002-build-time-resolution.md)).
- `extras.json` (hand-curated input, e.g. TU Delft `Q752663`) — exempt from the Tranco check, each entry must cite a source.
- `tranco-top100k` — compact set: sorted 32-bit FNV-1a hashes, Golomb-Rice coded (~207 KB gzipped). No false negatives; false-positive rate ≈ n/2³² ≈ 2.3e-5.
- `confusables.json` — Latin/Cyrillic/Greek subset of Unicode `confusables.txt`.
- `rdap-hosts.json` — RDAP server hosts from the IANA bootstrap, used for the CSP `connect-src` allowlist.
- `data-diff.md` — human-reviewed report of official domains that changed since the last build.

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
