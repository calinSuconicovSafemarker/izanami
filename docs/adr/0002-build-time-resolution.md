# ADR-0002: Resolve official domains at build time, require both sources to agree

Status: Accepted — 2026-11-17

## Context

The site shows a confirmed official domain for ~500 organisations. Candidate sources: Wikidata P856 (official website) and Tranco (popularity rank). Fortune lists are copyrighted and company-only.

Wikidata is openly editable, so a vandalised P856 could make a phishing domain look official. Tranco shows popularity, not ownership.

## Decision

- A build script (`npm run build:data`) generates `orgs.json`: Wikidata entities with P856 whose registrable domain is in Tranco top ~10k, top 500 by rank.
- An organisation is included only when its Wikidata domain also has a Tranco rank.
- All P856 values become the organisation's known official domains; the best-ranked one is primary.
- Hand-curated `extras.json` (e.g. TU Delft, `Q752663`) is exempt from the Tranco requirement but must cite a source.
- Each build writes `data-diff.md` listing changed official domains; a human reviews it before committing.
- The UI wording is "Wikidata lists this as official + Tranco shows it is heavily used", never "proven".
- Refresh is manual for now; a monthly PR-opening Action is backlog ticket B2.

## Consequences

- No runtime dependency on Wikidata/Tranco; instant page load.
- Data can go stale between rebuilds; `confirmedAt` is shown.
- Organisations whose official domain is unpopular are excluded unless added as extras.

## Amendment 1 — 2026-11-18: which entity names a domain

Several Wikidata entities often list the same domain (Google Search, Snowflake ID, Gmail, small clubs listing `instagram.com`). The generator now:

- reads every non-deprecated P856 (X keeps `twitter.com` next to its preferred `x.com`) and counts a P856 only when its host is the registrable domain or its `www.` (Gmail's `mail.google.com` does not claim google.com);
- resolves P31 class ancestry in a separate query and drops Wikimedia lists and humans;
- ranks claimants by sitelinks, doubled for organisations (P31/P279* Q43229) with ≥ 10 sitelinks and halved for software/concepts/products that are not also a website; the best claimant takes all its domains, so each domain belongs to one entry;
- falls back to the country of origin (P495) when there is no country or HQ country.

Google's organisation item (Q95) lists only `about.google`, so Google is a curated extra (source: Google Search's P856).

## Amendment 2 — 2026-11-19: related official domains

Organisations use more domains than their own P856 sites (Google: youtube.com, gmail.com, g.co, gstatic.com). Ticket 15 adds `relatedDomains: { domain, source, via?, url? }[]` to each org, from three passive sources, and the checker treats them as official:

- **`wikidata-owned`**: P856 of entities linked to the org by owned by (P127), parent organization (P749) or subsidiary (P355), two levels deep. Ended (P582), deprecated and minority (P1107 < 0.5) links are ignored. As for official domains, the P856 must be a site root and the domain must have a Tranco rank (top 1M): Wikidata alone is not enough. The graph is read through the Action API (CirrusSearch `haswbstatement` + `wbgetentities`, cached), not WDQS, whose reverse P127/P749 lookups time out; only children that list a P856 are followed. `BUILD_DATA_OWNERSHIP=cache-only` builds from cached responses when Wikidata is overloaded, and `data-diff.md` then says the crawl is partial.
- **`published-list`**: lists the company publishes for machines (`scripts/data/published-lists.json`, cached): Google's supported domains, the Microsoft 365 endpoints web service. Third-party and tenant-hosting domains in a list are excluded by hand.
- **`curated`**: `relatedDomains` in `extras.json`, each with a source URL. `owns` entries add curated ownership links where Wikidata has none (Google owns the g.co item; Microsoft makes Windows and Office).

Rules:

- A domain belongs to one organisation. Curated beats published beats Wikidata, then the nearer owner, then the better-ranked org.
- Another org's official domain is skipped, unless this org owns that org per Wikidata or a curated `owns` link (youtube.com is YouTube's own entry and also Google's related domain, credited via YouTube). This is the only overlap.
- Domains whose subdomains anyone can rent (the domain itself is a Public Suffix List private suffix: appspot.com, googleapis.com, azureedge.net) are never added from Wikidata or published lists: they would make a lookalike hosted there "Official". Curated entries may override this (withgoogle.com is on the PSL, but only Google uses it).
- `data-diff.md` lists related-domain changes and the curated/published domains that were skipped.

## Amendment 3 — 2026-11-19: brand TLDs

Some organisations run their own top-level domain (Google: `.google`, `.gle`, `.youtube`; Microsoft: `.microsoft`, `.xbox`). Ticket 14 adds `brandTlds: string[]` (punycode, no dot) to each org; every domain under one of them counts as official.

- **Operator**: the IANA Root Zone Database index (`https://www.iana.org/domains/root/db`, one cached page) names each TLD's manager.
- **Closed, not open**: a TLD counts when ICANN's gTLD list (`gtlds.json`, cached) marks it Specification 13 (.brand: only the operator and its affiliates may hold names) in a live agreement. Brand registries also run open TLDs (Charleston Road Registry: `.app`, `.dev`), which never count. Closed brand TLDs without Specification 13 (`.gle`, `.goog`, `.baidu`) are listed by hand.
- **Mapping**: `scripts/data/brand-tlds.json` maps the manager name exactly as IANA spells it to one org (Charleston Road Registry Inc. → Google), with a source URL per entry and per hand-listed TLD. A TLD goes to that one org only (`.youtube` → Google, not the YouTube entry).
- `data-diff.md` lists brand-TLD changes, and notes mapped operators IANA lists for no TLD and hand-listed TLDs IANA attributes to another manager.
