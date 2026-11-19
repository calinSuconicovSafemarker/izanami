# Glossary

**Organisation** — An entry in the bundled list (company, university, bank, government body). Not "company": the list is not limited to businesses.

**Primary domain** — The single domain shown first for an organisation (e.g. `tudelft.nl`).

**Known official domains** — The organisation's own sites (registrable domains of its Wikidata P856 values, or of a curated extra) plus its *Official*-level related domains (published by the company or curated with a source). Any of them, or any domain under one of its brand TLDs → verdict *Official*. Wikidata-listed related domains are **not** known official domains.

**Related domain** — A domain the organisation's products, subsidiaries or systems use besides its own sites (Google: `youtube.com`, `gstatic.com`). Two trust levels ([ADR-0002](adr/0002-build-time-resolution.md) Amendment 4):
- *Official* — published by the company in a machine-readable list (`published-list`) or curated with a source URL (`curated`). Short-circuits to verdict *Official*.
- *Listed (verify at lookup)* — Wikidata lists it as owned (`wikidata-owned`, via P127/P749/P355). Wikidata keeps dead acquisitions, investments and properties, so a lapsed domain may since have been re-registered by someone else: it only adds the `listed-related` legit signal, and every other rule still runs.

**Listed-related** — The rule (−30) that fires when the variant is a Wikidata-listed related domain of the organisation ("Listed by Wikidata as owned by Google (via YouTube)").

**Wikidata confirmation** — The domain appears in the organisation's Wikidata "official website" (P856). Means "listed as official", not proven ownership.

**Tranco confirmation** — The domain has a Tranco rank. Means "heavily used", not ownership.

**Variant** — The domain the user types into the lookup terminal.

**Registrable domain** — The part of a hostname a person can register, per the Public Suffix List (`login.tudelft.nl.evil.co.uk` → `evil.co.uk`).

**Brand label** — The organisation's identifying label (`tudelft`), prefilled in the terminal.

**Lookalike** — A variant similar to the brand label: TLD swap, typo (edit distance), homoglyph/IDN, combo-squat (`tudelft-login`), or subdomain trick.

**Confusables skeleton** — A string normalised with Unicode confusables so `tudеlft` (Cyrillic е) and `tudelft` compare equal.

**Existence state** — One of *Not registered*, *Registered, not resolving*, *Resolving*.

**Brand TLD** — A top-level domain an organisation runs for itself (`.google`, `.gle`): every domain under it is the organisation's, so any of them → verdict *Official*. A brand TLD can belong to several organisations when the owner shares it with an organisation it owns (`.youtube` → Google and YouTube). On another organisation's page it rates as *brand* ("brand TLD (Google)"). Generated from the IANA Root Zone Database (TLD manager) and ICANN's Specification 13 (.brand) flag through a curated operator → organisation mapping ([ADR-0002](adr/0002-build-time-resolution.md) Amendment 3).

**Defensive registration** — A lookalike registered by the organisation itself to keep it away from attackers. Typically shares nameservers/registrar with the official domain.

**Infrastructure overlap** — Shared nameservers, registrar, MX provider or hosting ASN between variant and official domain. Points toward legit.

**Rule / signal** — A pure check producing *fired / not fired / unknown* plus a weight and a plain-English explanation.

**Verdict** — *Official*, *Likely legit*, *Suspicious*, *Likely fraud*, or *Insufficient data*.

**LookupClient** — The single interface through which all network lookups go (DoH, RDAP, ASN, crt.sh). Swapped for a fixture client in tests.

**DoH** — DNS-over-HTTPS (Cloudflare JSON API, Google as fallback).

**RDAP** — Registration Data Access Protocol, the JSON successor to WHOIS. Provides registration date and registrar. Registrant is usually redacted.
