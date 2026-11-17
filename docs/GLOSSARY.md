# Glossary

**Organisation** — An entry in the bundled list (company, university, bank, government body). Not "company": the list is not limited to businesses.

**Primary domain** — The single domain shown first for an organisation (e.g. `tudelft.nl`).

**Known official domains** — All registrable domains derived from the organisation's Wikidata P856 values plus curated extras. Any of them → verdict *Official*.

**Wikidata confirmation** — The domain appears in the organisation's Wikidata "official website" (P856). Means "listed as official", not proven ownership.

**Tranco confirmation** — The domain has a Tranco rank. Means "heavily used", not ownership.

**Variant** — The domain the user types into the lookup terminal.

**Registrable domain** — The part of a hostname a person can register, per the Public Suffix List (`login.tudelft.nl.evil.co.uk` → `evil.co.uk`).

**Brand label** — The organisation's identifying label (`tudelft`), prefilled in the terminal.

**Lookalike** — A variant similar to the brand label: TLD swap, typo (edit distance), homoglyph/IDN, combo-squat (`tudelft-login`), or subdomain trick.

**Confusables skeleton** — A string normalised with Unicode confusables so `tudеlft` (Cyrillic е) and `tudelft` compare equal.

**Existence state** — One of *Not registered*, *Registered, not resolving*, *Resolving*.

**Defensive registration** — A lookalike registered by the organisation itself to keep it away from attackers. Typically shares nameservers/registrar with the official domain.

**Infrastructure overlap** — Shared nameservers, registrar, MX provider or hosting ASN between variant and official domain. Points toward legit.

**Rule / signal** — A pure check producing *fired / not fired / unknown* plus a weight and a plain-English explanation.

**Verdict** — *Official*, *Likely legit*, *Suspicious*, *Likely fraud*, or *Insufficient data*.

**LookupClient** — The single interface through which all network lookups go (DoH, RDAP, ASN, crt.sh). Swapped for a fixture client in tests.

**DoH** — DNS-over-HTTPS (Cloudflare JSON API, Google as fallback).

**RDAP** — Registration Data Access Protocol, the JSON successor to WHOIS. Provides registration date and registrar. Registrant is usually redacted.
