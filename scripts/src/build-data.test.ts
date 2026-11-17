import { describe, expect, it, vi } from 'vitest';
import { buildData } from './build-data';
import { buildDatasets } from './datasets/index';
import { buildOrgs } from './orgs';

vi.mock('./orgs', () => ({ buildOrgs: vi.fn(async () => undefined) }));
vi.mock('./datasets/index', () => ({ buildDatasets: vi.fn(async () => {}) }));

describe('buildData', () => {
  it('runs the org list step', async () => {
    await expect(buildData()).resolves.toBeUndefined();
    expect(buildOrgs).toHaveBeenCalled();
  });

  it('generates the static lookup datasets', async () => {
    await buildData();
    expect(buildDatasets).toHaveBeenCalled();
  });
});
