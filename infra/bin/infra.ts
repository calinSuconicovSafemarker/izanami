#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { GitHubDeployStack } from '../lib/github-deploy-stack';
import { InfraStack } from '../lib/infra-stack';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteDir = join(root, 'web', 'dist');
if (!existsSync(join(siteDir, 'index.html'))) {
  throw new Error(`${siteDir} has no index.html — run \`npm run build -w web\` first.`);
}
const { hosts } = JSON.parse(
  readFileSync(join(root, 'web', 'src', 'data', 'rdap-hosts.json'), 'utf8'),
) as { hosts: string[] };

const app = new App();
new InfraStack(app, 'LookalikeCheckerStack', { siteDir, rdapHosts: hosts });

// One-time CI/CD stack, only synthesised when a repo is configured:
//   npx cdk deploy LookalikeCheckerGitHubDeploy -c githubRepo=<owner>/<name>
// (or set GITHUB_DEPLOY_REPO). Optional: -c githubBranch=main,
// -c githubOidcProviderArn=<arn> to reuse an existing provider.
const ctx = (key: string) => app.node.tryGetContext(key) as string | undefined;
const repository = ctx('githubRepo') ?? process.env.GITHUB_DEPLOY_REPO;
if (repository) {
  new GitHubDeployStack(app, 'LookalikeCheckerGitHubDeploy', {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
    repository,
    branch: ctx('githubBranch'),
    bootstrapQualifier: ctx('@aws-cdk/core:bootstrapQualifier'),
    existingOidcProviderArn: ctx('githubOidcProviderArn'),
  });
}
