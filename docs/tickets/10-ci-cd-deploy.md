# 10 — CI/CD deploy via OIDC

**Depends on:** 09

## Goal
Merging to `main` builds, tests and deploys without long-lived AWS keys.

## Scope
- CDK (separate small stack or bootstrap step) creating the GitHub OIDC provider and a deploy role restricted to this repo's `main` branch (`token.actions.githubusercontent.com:sub` condition), least-privilege for CDK deploy.
- `deploy.yml`: on push to `main` → install, lint, test, build, `cdk deploy --require-approval never` using `aws-actions/configure-aws-credentials` with `role-to-assume`.
- README section: one-time setup steps (bootstrap, create OIDC stack, set `AWS_ROLE_ARN` repo variable).

## Acceptance criteria
- No AWS access keys stored in GitHub secrets.
- A push to `main` deploys; a PR from a fork cannot assume the role.
- Failing tests block the deploy.
