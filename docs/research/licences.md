# Licences and terms of every source Izanami uses

**Question:** can Izanami (the website and the planned JSON API, ticket 18) be used **commercially**, for example by Safemarker staff at work?

**Read on:** 2026-11-19. Every page below was read on that date unless noted. This is an engineering summary, not legal advice. Where a provider says nothing, this file says "not stated". It never fills the gap with a guess.

## Short answer

- **Most sources are fine for commercial use:** Wikidata (CC0), IANA registries (CC0), Unicode (Unicode License V3, keep the notice), the Public Suffix List (MPL-2.0), all bundled npm libraries (MIT), and Google / Cloudflare public DNS.
- **Resolved (ticket 19): the Tranco list has been replaced** by the Majestic Million (CC BY 3.0) and the Chrome UX Report top origins (CC BY 4.0), both credited with the attribution their licences ask for. One small question remains about the CrUX mirror (see [Popularity lists](#popularity-lists-replace-tranco-ticket-19)). The original finding, kept for the record: **the Tranco list was a blocker.** Tranco states no licence of its own. It republishes notices for its five input lists, and one of them, Cloudflare Radar, is **CC BY-NC 4.0 (non-commercial)**. Two more (Cisco Umbrella and Farsight) state no licence at all. Treat the default Tranco list as **not cleared for commercial use** until Tranco or the upstreams say otherwise.
- **Unclear, needs a question to the provider:** Team Cymru IP-to-ASN (free community service, no terms for commercial use), crt.sh (no published terms), rdap.org (one person's free service, no terms), and some registry RDAP terms (Google Registry forbids "repackage, disseminate", which matters for the server-side API).
- **The API (ticket 18) changes the picture:** in the browser, each lookup comes from the visitor's own IP. From AWS Lambda, every lookup comes from a few shared AWS IPs on behalf of other people. That runs into per-IP rate limits (crt.sh, rdap.org) and into registry terms that ban "high volume, automated" querying and redistribution.

## Summary table

"Commercial use" means using Izanami's results at work, including through the API.

| Source | Used for | Commercial use | Attribution needed | Action |
| --- | --- | --- | --- | --- |
| Wikidata (WDQS + Action API) | Org list, official websites, owned domains | **Yes** (CC0) | No (we credit anyway) | None |
| ~~Tranco top-1M list~~ | **Replaced in ticket 19** by the two rows below | No / unclear: includes Cloudflare Radar (CC BY-NC 4.0); Umbrella and Farsight state no licence | — | Done: no longer used |
| Majestic Million | "Popular site" signal (top-100k set in the bundle); picks which orgs to list | **Yes** (CC BY 3.0) | Yes: name, link, licence link, note changes (credits page + export `sources`) | None |
| Chrome UX Report top origins (via `zakird/crux-top-lists`) | Same, combined with Majestic into popularity buckets | **Yes** for the data (CC BY 4.0, Google). The mirror repo states no licence of its own | Yes: Google, CC BY 4.0 link, note changes and the mirror | Low risk; a human may confirm the mirror is acceptable or drop CrUX (Majestic alone works) |
| IANA RDAP bootstrap (`dns.json`) | Which RDAP server answers each TLD | **Yes** (CC0, IANA protocol registry) | No | None |
| IANA Root Zone Database | Who runs each TLD (brand TLDs) | **Unclear, low risk**: no licence named; ICANN site terms grant no licence to reuse IP. We only extract facts (TLD → operator) | Not stated | Keep; we store facts and link each IANA page. Ask IANA only if we ever ship the pages themselves |
| ICANN gTLD list (`gtlds.json`, Spec 13 flag) | Which TLDs are .brand TLDs | **Unclear, low risk**: same ICANN terms, facts only | Not stated | Same as above |
| Mozilla Public Suffix List (inside `tldts`) | Registrable domain, public suffixes | **Yes** (MPL-2.0) | MPL: say it is MPL-2.0 and where its source is | Done on the credits page |
| Unicode confusables (UTS #39) | Homoglyph detection | **Yes** (Unicode License V3, "sell copies") | **Yes**: the copyright and permission notice must appear with copies or in documentation | Full notice on the credits page |
| Google `supported_domains` | Google's own country domains (related domains) | **Unclear, low risk**: no licence stated; Google ToS apply; list of facts | Not stated | Keep; ask Google only if challenged |
| Microsoft 365 endpoints web service | Microsoft's own domains (related domains) | **Unclear, low risk**: no licence stated; the docs invite "network perimeter device vendor[s]" to build on it | Not stated | Keep; use our own `clientrequestid` GUID (we do) |
| Hand-checked citations (`scripts/data/*.json`: vendor help pages, PSL, IANA pages) | Sources for curated related domains and brand TLDs | Yes: we cite facts and link them; no text copied | No | None |
| Spamhaus / Interisle reports | Hand-picked "abuse-heavy TLD" list | Yes: we cite the finding (a list of TLD names), no data copied | No | None |
| Cloudflare DNS-over-HTTPS (1.1.1.1) | DNS lookups (primary) | **Yes**: terms do not restrict commercial use | Only for ISPs / equipment makers that integrate 1.1.1.1 | None |
| Google Public DNS (DoH JSON) | DNS lookups (fallback) and the Team Cymru TXT queries | **Yes**: Google APIs ToS; "Anyone" may use it | Google APIs ToS: show attribution Google requires (none is specified for Public DNS) | None |
| Team Cymru IP-to-ASN (DNS) | Hosting network (ASN) of an IP | **Unclear**: "Free, forever" community service; no terms for commercial use | Not stated | **Ask Team Cymru** (support@cymru.com) before commercial / API use. Fallback: RDAP IP lookups, or a self-hosted dataset |
| crt.sh (Sectigo) | First certificate date (CT history) | **Unclear**: no terms published; "All rights reserved" footer | Not stated | **Ask Sectigo** (crt.sh mailing list) for API use; already optional (timeouts give "unknown") |
| rdap.org | RDAP for TLDs missing from the bootstrap | **Unclear**: run by one person "at my own cost"; no terms | Not stated | Keep as fallback only; for the API, consider sponsoring it or dropping the fallback |
| Registry RDAP servers (377 hosts; e.g. Verisign, Identity Digital, Google Registry) | Registration date, registrar, nameservers | **Yes for one-off lookups** ("lawful purposes"); **unclear for the API** (bans "high volume, automated" use; Google Registry bans "repackage, disseminate") | Not stated | Browser: fine. API: cache, keep volume low, show the registry as source; ask Google Registry if API output must include RDAP data for its TLDs |
| npm runtime libraries (React, React Router, tldts, punycode …) | The web app | **Yes** (all MIT) | MIT: keep copyright + permission notice | Listed with copyright lines on the credits page |

## What "server-side" (ticket 18) changes

| Topic | Browser (today) | AWS Lambda API |
| --- | --- | --- |
| Who sends the request | The visitor, from their own IP | Our Lambda, from shared AWS IPs, for anyone who calls the API |
| Per-IP limits | Rarely reached | crt.sh (5 requests/minute per IP, 2023 maintainer post) and rdap.org (10 requests per 10 s) will be hit quickly; Google Public DNS throttles above about 1,500 QPS per IP (no issue at our scale) |
| Registry RDAP terms | One lookup a person asked for | Arguably an "automated, electronic process"; output redistributes registry data. Caching (1 h, ticket 18) and low volume help |
| Popularity lists / Unicode / PSL | Data shipped in the JS bundle | Same data in the API output (`inPopularTop100k`, homoglyphs). Same licences; attribution goes in the `sources` field |
| Team Cymru | DNS TXT query through the visitor's DoH resolver | Same query, from AWS. Still no terms; ask first |

## Details

### Wikidata

- **Used:** `scripts/src/orgs/index.ts` (WDQS SPARQL `https://query.wikidata.org/sparql`, Action API `https://www.wikidata.org/w/api.php`).
- **Licence:** [Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing). Structured data is "released into the public domain under Creative Commons Zero".
- **Commercial:** yes. **Attribution:** not required. We credit Wikidata and link each org's item anyway.
- **Usage policy:** Wikimedia asks for a descriptive User-Agent. We send one (`scripts/src/lib/net.ts`) and pace requests 1 per second, with `maxlag=5`.
- **Server-side:** not affected (build time only).

### Tranco and the lists it aggregates (historical: replaced in ticket 19)

- **Used:** `scripts/src/lib/tranco.ts` downloads `https://tranco-list.eu/top-1m.csv.zip`. The top 100k domains ship in the bundle (`web/src/data/tranco-top100k.json`, the `in-tranco` rule and `inTrancoTop100k` in exports). The org generator also uses ranks to choose orgs.
- **Tranco's own terms:** none found. [tranco-list.eu](https://tranco-list.eu/), the [methodology page](https://tranco-list.eu/methodology), the [API docs](https://tranco-list.eu/api_documentation) and the [GitHub repo](https://github.com/DistriNet/tranco-list) state no licence for the list. The site's only legal link is a privacy policy.
- **Tranco's attribution notice (home page, "Attribution"):** lists its five providers with their licences: Cisco Umbrella ("available free of charge"), Majestic (CC BY 3.0), Farsight ("only for the default list", no licence given), CrUX (CC BY-SA 4.0 per Tranco) and Cloudflare Radar (CC BY-NC 4.0). It adds: "Tranco is not affiliated with any of these providers." Tranco asks for no attribution wording for itself. The CC BY licences upstream need credit to their creators, so the credits page names each upstream list with its licence and link.
- **Upstream licences, checked at the source:**
  - **Cloudflare Radar:** [developers.cloudflare.com/radar](https://developers.cloudflare.com/radar/): "made available under the CC BY-NC 4.0 license". **Non-commercial.**
  - **Majestic Million:** [majestic.com/reports/majestic-million](https://majestic.com/reports/majestic-million): CC BY 3.0 Unported. Commercial use OK with attribution.
  - **CrUX:** [CrUX methodology](https://developer.chrome.com/docs/crux/methodology): "licensed under a Creative Commons Attribution 4.0 International License". Note that Tranco says CC BY-SA 4.0 and Google says CC BY 4.0; Google's own page wins. Commercial use OK with attribution.
  - **Cisco Umbrella:** [download page](https://umbrella-static.s3-us-west-1.amazonaws.com/index.html) gives only "© Cisco Umbrella, 2016". No licence stated.
  - **Farsight:** no licence stated on the Tranco page; we found no public licence for the Farsight input.
- **Does Radar's NC licence taint Tranco?** Tranco does not say. The list is a rank average, so it is arguably a new work, and domain popularity is close to a fact. But Tranco itself repeats Radar's NC licence as the attribution for the list, and nothing grants a commercial licence. **Treat it as not cleared for commercial use.**
- **Rate limits:** API: 1 query/second for rank lookups. The daily zip download has no stated limit.
- **Server-side:** no new questions (build-time data), but the API would redistribute the derived fact `inTrancoTop100k`.
- **Recommendation (needs a human decision):**
  1. **Replace** with a commercial-safe ranking: the Majestic Million (CC BY 3.0) alone, or Majestic plus CrUX (CC BY 4.0). Both need attribution, which the credits page already has a slot for. This is the cleanest option.
  2. **Ask Tranco** whether a custom list built only from Majestic and CrUX can be used commercially. Tranco offers custom lists, but its configurator needs a login and we could not read its terms.
  3. **Keep Tranco** and state that Izanami is for non-commercial use only.

### Popularity lists (replace Tranco, ticket 19)

Read on 2026-11-19.

- **Used:** `scripts/src/lib/popularity.ts` downloads both lists once into `scripts/.cache/popularity/` and combines them per registrable domain: the best bucket across both lists (top 1k / 10k / 100k / 1M) and which lists name it. Domains in the top-100k bucket ship in the bundle (`web/src/data/popular-top100k.json`, the `not-popular` rule and `inPopularTop100k` in exports). The org generator uses the buckets (then the Majestic rank) to choose orgs.
- **Majestic Million:** [majestic.com/reports/majestic-million](https://majestic.com/reports/majestic-million) says the list is "Licensed under a Creative Commons Attribution 3.0 Unported License" (links to [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)). Download: `https://downloads.majestic.com/majestic_million.csv` (about 80 MB, refreshed daily; columns `GlobalRank,TldRank,Domain,TLD,RefSubNets,RefIPs,…`). The page asks for no specific attribution wording, so we use the CC BY 3.0 elements: title, creator, source link, licence link, and a note of our changes.
- **Chrome UX Report (CrUX):** Google's [CrUX methodology page](https://developer.chrome.com/docs/crux/methodology): "CrUX datasets by Google are licensed under a Creative Commons Attribution 4.0 International License." No specific wording requested; we use the CC BY 4.0 elements. Google publishes the rank buckets (`experimental.popularity.rank`) only in BigQuery, which needs a Google account.
- **CrUX mirror:** [github.com/zakird/crux-top-lists](https://github.com/zakird/crux-top-lists) publishes the global list each month as `data/global/YYYYMM.csv.gz` (`origin,rank`, rank = bucket bound 1000 / 5000 / 10000 / … / 1000000), exported unmodified from the public BigQuery dataset. The repo has **no LICENSE file** (GitHub API: `license: null`) and its README states no licence or terms. The data in it is Google's (CC BY 4.0); the export adds no creative content of its own. We credit Google, link the licence, and name the mirror. Treat as low risk; a human may decide to drop CrUX (Majestic alone covers the flagship orgs) or to query BigQuery directly.
- **Rate limits:** none stated for either download. We download each file once and cache it; the CrUX month is pinned (`CRUX_MONTH`) so rebuilds reuse the cache.
- **Server-side:** no new questions (build-time data); the API carries the derived fact `inPopularTop100k` and both attributions in `sources`.

### IANA: RDAP bootstrap and Root Zone Database

- **Used:** `https://data.iana.org/rdap/dns.json` (`scripts/src/datasets`), shipped as `web/src/data/rdap-hosts.json`. `https://www.iana.org/domains/root/db` (`scripts/src/orgs`): TLD operators for brand TLDs.
- **Licence:** [IANA licensing terms](https://www.iana.org/help/licensing-terms): protocol registries are "subject to the Creative Commons CC0 1.0 dedication" and "may be freely used by any party for any purpose". The RDAP bootstrap is the protocol registry ["Bootstrap Service Registry for Domain Name Space"](https://www.iana.org/assignments/rdap-dns/rdap-dns.xhtml), so CC0 applies.
- **Root Zone Database:** not a protocol registry, so the CC0 statement does not cover it, and no other licence is named. The site footer points to the [ICANN Terms of Service](https://www.icann.org/privacy/tos) (12 June 2020), which grant "no right or license to reproduce" ICANN IP. We only extract facts (which organisation runs a TLD) and link each IANA page. **Low risk; unclear.**
- **Server-side:** not affected.

### ICANN gTLD list (Specification 13 .brand flag)

- **Used:** `https://www.icann.org/resources/registries/gtlds/v2/gtlds.json` (`scripts/src/orgs`).
- **Licence:** none stated for the file. ICANN Terms of Service as above. We keep only the fact "this TLD has Specification 13". **Low risk; unclear.**

### Mozilla Public Suffix List

- **Used:** bundled inside the `tldts` library (scripts and web), and cited in `scripts/data/extras.json`.
- **Licence:** the file header: "subject to the terms of the Mozilla Public License, v. 2.0" ([list file](https://publicsuffix.org/list/public_suffix_list.dat), [publicsuffix.org](https://publicsuffix.org/)).
- **Commercial:** yes. **Obligations:** MPL-2.0 lets you ship it inside a larger work. When distributing it (our JS bundle), tell users it is MPL-2.0 and where to get the source. The credits page does that.

### Unicode confusables (UTS #39)

- **Used:** `https://www.unicode.org/Public/security/latest/confusables.txt`, turned into `web/src/data/confusables.json` (shipped).
- **Licence:** the file header points to the [Unicode terms of use](https://www.unicode.org/terms_of_use.html): data files fall under the [Unicode License V3](https://www.unicode.org/license.txt), which allows you to "use, copy, modify, merge, publish, distribute, and/or sell".
- **Attribution (required):** "this copyright and permission notice appear with all copies of the Data Files or Software" **or** in associated documentation. The full notice, starting "Copyright © 1991-2026 Unicode, Inc.", is reproduced on the credits page.
- **Also:** do not use the Unicode name or logo to promote Izanami.

### Google `supported_domains`

- **Used:** `https://www.google.com/supported_domains` (`scripts/data/published-lists.json`): Google's own country domains as related domains.
- **Licence:** none stated. [Google Terms of Service](https://policies.google.com/terms) (effective 30 July 2026) apply to google.com. Automated access must respect robots.txt; `robots.txt` does not block this path. The content is a list of Google's own domain names (facts). **Low risk; unclear.**

### Microsoft 365 URLs and IP address ranges

- **Used:** `https://endpoints.office.com/endpoints/worldwide` (`scripts/data/published-lists.json`).
- **Terms:** [the web service docs](https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-ip-web-service) name no licence. They say network perimeter device vendors can "build against the web service", so commercial products are expected. Rules: generate your own `ClientRequestId` GUID; on HTTP 429, wait 1 hour; check the version at most once an hour. We use our own GUID and call it only at build time.

### Cloudflare DNS-over-HTTPS (1.1.1.1)

- **Used:** `https://cloudflare-dns.com/dns-query` (`web/src/lookup/live-client.ts`), first resolver.
- **Terms:** [1.1.1.1 terms of use](https://developers.cloudflare.com/1.1.1.1/terms-of-use/) point to the [Cloudflare Website and Online Services Terms of Use](https://www.cloudflare.com/website-terms/) (effective 1 August 2025). There is no ban on commercial use. You may not "overburden" Cloudflare servers or circumvent limits on "API calls".
- **Attribution:** only for "Internet Service Providers and network equipment providers" that integrate 1.1.1.1. Not us.
- **Server-side:** fine at our volume.

### Google Public DNS

- **Used:** `https://dns.google/resolve` (fallback resolver; also answers the Team Cymru TXT queries when Cloudflare fails).
- **Terms:** [Google Public DNS terms](https://developers.google.com/speed/public-dns/terms) (last modified 24 June 2020): "you consent to be bound by the Google APIs Terms of Service". The [Google APIs ToS](https://developers.google.com/terms) (9 November 2021) neither forbids nor grants commercial use explicitly. It requires respecting usage limits and any attribution Google asks for (none for Public DNS).
- **Rate limits:** about 1,500 QPS per IP before throttling ([docs](https://developers.google.com/speed/public-dns/docs/isp)). "Google Public DNS is a free service with no SLA."
- **Server-side:** fine; Lambda IPs are shared, so keep the Cloudflare fallback.

### Team Cymru IP-to-ASN (over DNS)

- **Used:** TXT lookups of `<reversed-ip>.origin.asn.cymru.com` / `origin6.asn.cymru.com` through the DoH resolvers.
- **Terms:** [the service page](https://www.team-cymru.com/ip-asn-mapping) says "Free, forever", a community service. It states no commercial-use terms, no DNS rate limit and no attribution requirement. It asks heavy users to prefer DNS over WHOIS and not to use the country field for geolocation. Team Cymru's general [Data Services Agreement](https://www.team-cymru.com/terms) is for paid data contracts and does not clearly cover this free service.
- **Commercial:** **unclear.**
- **Recommendation:** email support@cymru.com and ask whether a public API (ticket 18) and use by a company are fine. If not: get the ASN from RDAP IP lookups (the RIRs), or ship a self-hosted IP-to-ASN dataset with a clear licence (not researched here).

### crt.sh (Sectigo)

- **Used:** `https://crt.sh/?q=<domain>&output=json` (first-certificate date).
- **Terms:** [crt.sh](https://crt.sh/) publishes none. Footer: "© Sectigo Limited 2015-2026. All rights reserved." The maintainers said on the [crt.sh mailing list](https://groups.google.com/g/crtsh/c/niabC5EYW2g) (May 2024) that there is no published fair-use policy. A 2023 maintainer post on the list gives a limit of 5 requests per minute per IP. Certificate Transparency logs themselves are public.
- **Commercial:** **unclear.**
- **Server-side:** shared AWS IPs will hit 5/minute fast. The fact is already optional (timeout = unknown).
- **Recommendation:** keep it in the browser. For the API, ask Sectigo on the crt.sh list, or switch to another CT search with clear terms (not researched here).

### rdap.org

- **Used:** fallback RDAP base for TLDs missing from the IANA bootstrap.
- **Terms:** [about.rdap.org](https://about.rdap.org/) has no terms. It is run by Gavin Brown "in my own time and at my own cost". Limit: 10 requests in 10 seconds per client. Blocked for abuse. It asks organisations that depend on it to support it.
- **Commercial:** **unclear** (not addressed).
- **Recommendation:** keep it as a rare fallback. For the API, sponsor it or skip the fallback (the fact becomes unknown).

### Registry RDAP servers

- **Used:** the RDAP server for each TLD from the IANA bootstrap (377 distinct hosts in `rdap-hosts.json`). Largest: Identity Digital, CentralNic, Nominet, GMO, Google Registry, Verisign.
- **Read:** three of them (each server links its own terms in every response):
  - [Verisign](https://www.verisign.com/domain-names/registration-data-access-protocol/terms-service/index.xhtml) (.com, .net): "only for lawful purposes"; no "high volume, automated, electronic processes"; no mass marketing.
  - [Identity Digital](https://www.identity.digital/policies/rdds-access-policy): the same wording, and per-IP throttling.
  - [Google Registry](https://www.registry.google/policies/rdap-terms/): "query-based access on an experimental basis"; no "high volume, automated electronic processes"; "Do not compile, repackage, disseminate" without written permission.
- **Not read individually:** the other 374 hosts. They are expected to follow the same pattern (ICANN registry agreements), but this was not checked one by one.
- **Commercial:** one-off lookups for lawful purposes: **yes**. Mass or automated use, or republishing results: **no / unclear**.
- **Server-side:** the API repackages RDAP facts (registrar, creation date) into its output. Keep volume low, cache, and do not offer bulk endpoints. Ask Google Registry if its TLDs (.app, .dev …) matter.

### npm runtime dependencies (shipped in the web bundle)

| Package | Licence | Copyright |
| --- | --- | --- |
| react, react-dom, scheduler | MIT | Meta Platforms, Inc. and affiliates |
| react-router, react-router-dom | MIT | React Training LLC 2015-2019; Remix Software Inc. 2020-2021; Shopify Inc. 2022-2023 |
| tldts, tldts-core | MIT (bundles the PSL, MPL-2.0) | 2017 Thomas Parisot, 2018 Rémi Berson |
| punycode | MIT | Mathias Bynens |
| cookie, set-cookie-parser (react-router deps) | MIT | Roman Shtylman, Douglas Christopher Wilson; Nathan Friedly |
| Tailwind CSS (build-time; its CSS ships) | MIT | Tailwind Labs, Inc. |

All MIT: commercial use is fine. The MIT notice must go with copies. The credits page lists each copyright line plus the MIT text. A stronger option for later: generate a `THIRD-PARTY-NOTICES.txt` into `dist/` at build time.

Dev-only tools (Vite, Vitest, ESLint, TypeScript, axe-core, jsdom …) do not ship and are not listed.

## Open questions for a human

1. ~~**Tranco:** replace it, ask Tranco, or declare Izanami non-commercial?~~ Decided: replaced by the Majestic Million and CrUX (ticket 19). Remaining question: is the unlicensed CrUX mirror (`zakird/crux-top-lists`, an unmodified export of Google's CC BY 4.0 BigQuery dataset) acceptable, or should Izanami use Majestic alone (or query BigQuery itself)?
2. **Team Cymru, crt.sh, rdap.org:** send three short emails asking whether company use and a public API are fine.
3. **API and registry RDAP terms:** accept the risk with caching and low volume, or drop RDAP facts from the API output for registries that forbid redistribution (Google Registry).
4. **Izanami's own licence:** the repo has no LICENSE file. Pick one before others reuse the code or the API.
