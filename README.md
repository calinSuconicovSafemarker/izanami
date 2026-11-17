# Lookalike checker

Static web app (`web/`) deployed to S3 + CloudFront by the CDK app in `infra/`.

## Development

```sh
npm ci
npm run lint
npm test
npm run build          # also builds web/dist, needed by cdk synth/deploy
npm run synth -w infra
```

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: install, lint, test, build, then
`cdk deploy LookalikeCheckerStack`. Any failing step stops the job before AWS credentials are
requested. AWS access uses GitHub OIDC: there are no AWS keys in GitHub secrets. The deploy role
only trusts tokens whose subject is `repo:<owner>/<name>:ref:refs/heads/main`, so pull requests
and forks cannot assume it, and its only permission is assuming the CDK bootstrap roles.

### One-time setup

Run these once with admin credentials for the target AWS account, from the repo root.
`<owner>/<name>` is the GitHub repository (for example `my-org/lookalike-checker`).

1. Build the site (the CDK app needs `web/dist`):

   ```sh
   npm ci && npm run build
   ```

2. Bootstrap CDK in the account and region you will deploy to:

   ```sh
   cd infra
   npx cdk bootstrap aws://<account-id>/<region>
   ```

3. Create the GitHub OIDC provider and deploy role:

   ```sh
   npx cdk deploy LookalikeCheckerGitHubDeploy -c githubRepo=<owner>/<name>
   ```

   The repository can also be given as the `GITHUB_DEPLOY_REPO` environment variable.
   Optional context values:
   - `-c githubBranch=<branch>`: allow a branch other than `main`.
   - `-c githubOidcProviderArn=<arn>`: reuse an existing
     `token.actions.githubusercontent.com` provider (an account can have only one), instead of
     creating it.
   - `-c @aws-cdk/core:bootstrapQualifier=<qualifier>`: if you bootstrapped with a custom
     qualifier.

4. In GitHub, under Settings → Secrets and variables → Actions → Variables, add two
   repository variables (variables, not secrets):
   - `AWS_ROLE_ARN`: the `DeployRoleArn` output of step 3.
   - `AWS_REGION`: the region you bootstrapped in step 2.

After that, a push to `main` deploys. The `DistributionUrl` output of `LookalikeCheckerStack`
is the site URL.
