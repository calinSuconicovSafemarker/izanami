import { describe, expect, it } from 'vitest';
import { exportFilename } from './filename';

const at = new Date('2026-11-19T08:05:00Z');

describe('exportFilename', () => {
  it('is izanami-<subject>-<yyyymmdd-hhmm UTC>.<ext>', () => {
    expect(exportFilename('tudelft.com', at, 'json')).toBe(
      'izanami-tudelft.com-20261119-0805.json',
    );
  });

  it('replaces characters that are unsafe in file names', () => {
    expect(exportFilename('scan tu/delft:', at, 'csv')).toBe(
      'izanami-scan-tu-delft--20261119-0805.csv',
    );
  });
});
