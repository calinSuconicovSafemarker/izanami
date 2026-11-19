# 13 — Domain analysis panel

**Status:** Done (4f1035e)

**Depends on:** 12 (same card area)

## Goal
Show the domain-level details the mentor asked for: similarity, the typosquatting technique detected, and registration information where available.

## Scope
- New "Domain analysis" panel between the terminal and the verdict card:
  - **Technique**: human label for `similarity().kind` (TLD swap, typo, homoglyph, combo-squat, subdomain trick, unrelated) plus a one-line description of how that attack works.
  - **Similarity**: edit distance and a similarity % to the brand label; for homoglyphs, highlight which characters were swapped.
  - **Forms**: Unicode and punycode.
  - **Registration** (when RDAP has it): registration date and age ("2001-07-01 · 25 years"), registrar, nameservers, and the official domain's registration date for comparison; "not published by registry" when absent.
  - **Hosting**: IP(s) and ASN, flagged when shared with the official domain.
- Pure presentational component fed by `useLookup` state and `similarity`; add missing derived values (similarity %, swapped chars) as pure functions in `web/src/domain/`.

## Acceptance criteria
- Component tests for each technique kind and for missing registration data.
- Homoglyph case shows the swapped character(s).
- Works at 375 px; Tailwind only; no inline styles.
