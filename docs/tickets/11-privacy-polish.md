# 11 — Privacy panel, disclaimer, a11y polish

**Depends on:** 05

## Goal
Make the tool honest about what it does and pleasant to use.

## Scope
- "What this tool sends where" panel (footer link + modal): lists Cloudflare/Google DoH, the registry RDAP server / rdap.org, IANA, Team Cymru (via DoH), crt.sh — and that we run no backend and no analytics.
- Disclaimer on every org page: "Heuristic, not a guarantee. Passive public lookups only."
- README: project description, screenshots, architecture diagram, ADR links, ethics note (passive only).
- Accessibility pass: focus order, visible focus, contrast AA, reduced motion, labels on chips.
- Mobile pass at 375 px.

## Acceptance criteria
- Lighthouse accessibility ≥ 95.
- No third-party request on page load other than those listed in the panel (checked in devtools).
