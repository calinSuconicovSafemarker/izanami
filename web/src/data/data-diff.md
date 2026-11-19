# Data diff

Review before committing (ADR-0002).

## Notes (1)

- Ownership crawl partial: 25 Wikidata API responses were unavailable, so some wikidata-owned related domains are missing. Rerun without BUILD_DATA_OWNERSHIP=cache-only.

## Changed related domains (7)

- Google (Q95): +g.co (curated: g.co), +google.com.hk (curated: Google Hong Kong)
- Microsoft (Q2283): +linkedin.com (curated: LinkedIn), +office.com (curated: Microsoft Office), +office365.com (curated: Microsoft 365), +outlook.com (curated: Microsoft Web Services), +windows.com (curated: Microsoft Windows)
- Apple Inc. (Q312): +icloud.com (curated: iCloud)
- United Nations (Q1065): +cerlalc.org (wikidata-owned: Regional Center for the Promotion of Books in Latin America and Caribbean)
- Rakuten Group, Inc. (Q973054): +soompi.com (wikidata-owned: Soompi)
- University of Washington (Q219563): +burkemuseum.org (wikidata-owned: Burke Museum of Natural History and Culture)
- University of Michigan (Q230492): +mottchildren.org (wikidata-owned: C.S. Mott Children's Hospital)

## Skipped related domains (1)

- Q2283: azureedge.net (published-list) — shared hosting (Public Suffix List private section)
