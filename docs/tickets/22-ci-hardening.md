# 22 — CI/CD hardening

**Status:** Done (8130ec3)

**Depends on:** 10 · Security scan F3, F4

## Goal
Make the GitHub workflows safe before the OIDC deploy role is ever enabled, and pin third-party code.

## Scope
- `pages.yml`: workflow-level `permissions: contents: read`; give `pages: write` + `id-token: write` only to the `deploy` job (which runs no npm code).
- `github-deploy-stack.ts`: trust `sub = repo:<owner>/<repo>:environment:<env>` (a protected environment) instead of the branch ref, so a build job can't assume the role. Update its CDK test.
- Pin every action in `ci.yml` / `pages.yml` to a full commit SHA with the version as a comment.
- Add `.github/dependabot.yml` for `github-actions` and `npm` (weekly, grouped).
- Document in the README: the `github-pages` environment should only allow `main` (repo setting, user action).

## Acceptance criteria
- Semgrep `p/github-actions` reports 0 findings.
- `build` job has no `id-token` permission; CDK test asserts the environment-scoped `sub`.
- CI and Pages runs green after the change.
