# 00 — Scaffold monorepo

**Status:** Done (0ac027d)

**Depends on:** —

## Goal
An empty but working TypeScript monorepo matching the layout in [SPEC](../SPEC.md#repo-layout).

## Scope
- `git init`, `.gitignore`, root `package.json` with npm workspaces: `web`, `scripts`, `infra`.
- `/web`: Vite + React + TS (strict) + Tailwind + Vitest; hash router installed; dark default theme; placeholder home page.
- `/scripts`: Node + TS (tsx), empty `build-data.ts` wired to root `npm run build:data`.
- `/infra`: `cdk init app --language typescript` skeleton, no resources yet.
- ESLint + Prettier shared config; root scripts `lint`, `test`, `build`.
- GitHub Actions `ci.yml`: install, lint, test, build on PR (no deploy).
- Tailwind/Vite configured so the production build emits **no inline scripts or styles** (needed for CSP, [ADR-0004](../adr/0004-security-headers.md)).

## Acceptance criteria
- `npm install && npm run lint && npm test && npm run build` passes from the root.
- `npm run dev -w web` serves a page at localhost.
- `grep` of `web/dist/index.html` shows no inline `<script>` bodies or `style=` attributes.
