import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const path = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.github',
  'workflows',
  'deploy.yml',
);
const raw = readFileSync(path, 'utf8');

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
}
interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency?: unknown;
  jobs: Record<string, { steps: Step[]; needs?: string | string[]; environment?: unknown }>;
}
const wf = parse(raw, { strict: true, uniqueKeys: true }) as Workflow;
const steps = Object.values(wf.jobs).flatMap((j) => j.steps);
const indexOf = (pred: (s: Step) => boolean) => steps.findIndex(pred);

describe('deploy.yml', () => {
  it('runs only on push to main (never on pull_request / pull_request_target)', () => {
    expect(Object.keys(wf.on)).toEqual(['push']);
    expect(wf.on.push).toEqual({ branches: ['main'] });
  });

  it('requests an OIDC token with read-only contents and serialises deploys', () => {
    expect(wf.permissions).toEqual({ 'id-token': 'write', contents: 'read' });
    expect(wf.concurrency).toBeDefined();
  });

  it('uses no AWS access keys or secrets at all', () => {
    expect(raw).not.toMatch(/secrets\./);
    expect(raw).not.toMatch(/AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|aws-access-key-id/i);
  });

  it('assumes the role from the AWS_ROLE_ARN repo variable via configure-aws-credentials', () => {
    const creds = steps.find((s) => s.uses?.startsWith('aws-actions/configure-aws-credentials@'));
    expect(creds?.with?.['role-to-assume']).toBe('${{ vars.AWS_ROLE_ARN }}');
    expect(creds?.with?.['aws-region']).toBeDefined();
  });

  it('installs, lints, tests and builds before getting credentials or deploying', () => {
    const ci = indexOf((s) => s.run === 'npm ci');
    const lint = indexOf((s) => s.run === 'npm run lint');
    const test = indexOf((s) => s.run === 'npm test');
    const build = indexOf((s) => s.run === 'npm run build');
    const creds = indexOf((s) => !!s.uses?.startsWith('aws-actions/configure-aws-credentials@'));
    const deploy = indexOf((s) => !!s.run?.includes('cdk deploy'));
    for (const i of [ci, lint, test, build, creds, deploy]) expect(i).toBeGreaterThanOrEqual(0);
    expect(ci).toBeLessThan(lint);
    expect(lint).toBeLessThan(test);
    expect(test).toBeLessThan(build);
    expect(build).toBeLessThan(creds);
    expect(creds).toBeLessThan(deploy);
    // no step may swallow failures
    expect(raw).not.toMatch(/continue-on-error|\|\| true/);
  });

  it('deploys only the site stack without prompting', () => {
    const deploy = steps.find((s) => s.run?.includes('cdk deploy'));
    expect(deploy?.run).toMatch(/cdk deploy LookalikeCheckerStack .*--require-approval never/);
  });
});
