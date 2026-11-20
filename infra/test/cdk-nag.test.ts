import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App, type Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { GitHubDeployStack } from '../lib/github-deploy-stack';
import { InfraStack } from '../lib/infra-stack';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Rule names cdk-nag reports for a stack, after the acknowledgements written in the stack. */
function violations(stack: Stack): string[] {
  const report = new AwsSolutionsChecks().validateScope(stack);
  return report.violations.flatMap((v) =>
    v.violatingResources.map((r) => `${v.ruleName} @ ${r.constructPath}`),
  );
}

// Building and checking the whole stack takes a few seconds on a busy machine.
describe('cdk-nag AwsSolutions (ticket 23)', { timeout: 60_000 }, () => {
  it('finds nothing unacknowledged in the site + API stack', () => {
    const siteDir = mkdtempSync(join(tmpdir(), 'site-'));
    writeFileSync(join(siteDir, 'index.html'), '<!doctype html>');
    const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
    const stack = new InfraStack(app, 'NagStack', {
      siteDir,
      rdapHosts: ['https://rdap.nic.example'],
      repoRoot,
    });
    expect(violations(stack)).toEqual([]);
  });

  it('finds nothing in the GitHub deploy stack', () => {
    const app = new App();
    const stack = new GitHubDeployStack(app, 'NagDeploy', { repository: 'owner/izanami' });
    expect(violations(stack)).toEqual([]);
  });
});
