import { describe, expect, it, vi } from 'vitest';
import { buildData } from './build-data';
import { buildOrgs } from './orgs';

vi.mock('./orgs', () => ({ buildOrgs: vi.fn(async () => undefined) }));

describe('buildData', () => {
  it('runs the org list step', async () => {
    await expect(buildData()).resolves.toBeUndefined();
    expect(buildOrgs).toHaveBeenCalledOnce();
  });
});
