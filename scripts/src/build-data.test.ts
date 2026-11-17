import { describe, expect, it } from 'vitest';
import { buildData } from './build-data';

describe('buildData', () => {
  it('runs to completion (placeholder until ticket 01)', async () => {
    await expect(buildData()).resolves.toBeUndefined();
  });
});
