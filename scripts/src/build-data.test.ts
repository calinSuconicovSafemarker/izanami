import { describe, expect, it, vi } from 'vitest';
import { buildData } from './build-data';
import { buildDatasets } from './datasets/index';

vi.mock('./datasets/index', () => ({ buildDatasets: vi.fn(async () => {}) }));

describe('buildData', () => {
  it('runs to completion (placeholder until ticket 01)', async () => {
    await expect(buildData()).resolves.toBeUndefined();
  });

  it('generates the static lookup datasets', async () => {
    await buildData();
    expect(buildDatasets).toHaveBeenCalled();
  });
});
