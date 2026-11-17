# 02 — Static lookup datasets

**Status:** Done (3351eab)

**Depends on:** 00

## Goal
The build script also generates the small runtime datasets the browser needs.

## Scope
- `tranco-top100k`: compact membership set of the top 100k registrable domains (sorted hash array or Bloom filter; target < 300 KB gzipped) + a `has(domain)` helper in `web`.
- `confusables.json`: subset of Unicode `confusables.txt` covering Latin, Cyrillic, Greek mapping to Latin skeletons.
- `rdap-hosts.json`: RDAP base URLs from `https://data.iana.org/rdap/dns.json` (TLD → base URL), also used for the CSP `connect-src` list.
- Wire into `npm run build:data` (shares the Tranco download with ticket 01 if already present; otherwise independent).

## Acceptance criteria
- `has('google.com') === true`, `has('tudelft-nonexistent-zzzq.com') === false`; false-positive rate documented if Bloom filter.
- Confusables maps Cyrillic `е` (U+0435) → `e`.
- `rdap-hosts.json` contains `nl → https://rdap.sidn.nl/` and `com → https://rdap.verisign.com/com/v1/`.
- Sizes of all generated files logged by the script.
