import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

// The site is hosted on GitHub Pages (ADR-0005); this guards the deploy workflow.
const path = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.github',
  'workflows',
  'pages.yml',
);
const raw = readFileSync(path, 'utf8');

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, string>;
}
interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<
    string,
    { steps: Step[]; needs?: string | string[]; permissions?: Record<string, string> }
  >;
}
const wf = parse(raw, { strict: true, uniqueKeys: true }) as Workflow;
const build = wf.jobs.build!.steps;
const indexOf = (pred: (s: Step) => boolean) => build.findIndex(pred);

describe('pages.yml', () => {
  it('runs on push to main (and manually), never on pull requests', () => {
    expect(Object.keys(wf.on).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(wf.on.push).toEqual({ branches: ['main'] });
  });

  it('has only the permissions Pages needs and uses no secrets', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(raw).not.toMatch(/secrets\./);
  });

  it('grants pages/id-token write only to the deploy job, never to the npm build', () => {
    expect(wf.jobs.build!.permissions).toBeUndefined();
    expect(wf.jobs.deploy!.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
    expect(wf.jobs.deploy!.steps.some((s) => s.run)).toBe(false);
  });

  it('pins every action to a full commit SHA', () => {
    const uses = Object.values(wf.jobs).flatMap((j) => j.steps.flatMap((s) => s.uses ?? []));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it('lints, tests and builds before uploading the site, and never swallows failures', () => {
    const order = ['npm ci', 'npm run lint', 'npm test', 'npm run build'].map((r) =>
      indexOf((s) => s.run === r),
    );
    const upload = indexOf((s) => !!s.uses?.startsWith('actions/upload-pages-artifact@'));
    for (const i of [...order, upload]) expect(i).toBeGreaterThanOrEqual(0);
    expect([...order, upload]).toEqual([...order, upload].slice().sort((a, b) => a - b));
    expect(build[upload]?.with?.path).toBe('web/dist');
    expect(raw).not.toMatch(/continue-on-error|\|\| true/);
  });

  it('deploys only after the build job succeeds', () => {
    expect(wf.jobs.deploy?.needs).toBe('build');
    expect(wf.jobs.deploy?.steps.some((s) => s.uses?.startsWith('actions/deploy-pages@'))).toBe(
      true,
    );
  });
});
