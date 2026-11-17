# 03 — Domain parsing & similarity

**Status:** Done (9704260)

**Depends on:** 00, 02 (confusables data)

## Goal
Pure functions that turn user input into a normalised variant and measure how close it is to the brand.

## Scope
- `parseVariant(input)` → `{ input, unicode, punycode, registrableDomain, label, tld, subdomains, isSubdomainTrick }` using the Public Suffix List (e.g. `tldts`). Reject invalid input with a clear error.
- `similarity(variant, brandLabel, officialDomains)` →
  `{ isOfficial, editDistance, homoglyph, containsBrand, tldSwap, kind: 'official'|'tld-swap'|'typo'|'homoglyph'|'combo'|'subdomain-trick'|'unrelated' }`.
- Confusables skeleton using the dataset from 02.

## Acceptance criteria (table-driven tests)
| input | expected kind |
|---|---|
| `tudelft.nl` | official |
| `tudelft.md` | tld-swap |
| `tuddelft.nl` | typo |
| `tudеlft.nl` (Cyrillic е) | homoglyph |
| `tudelft-login.com` | combo |
| `tudelft.nl.evil.com` | subdomain-trick (registrable `evil.com`) |
| `example.org` | unrelated |
- `xn--` input round-trips to Unicode and back.
