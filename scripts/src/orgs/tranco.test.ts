import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePsl } from './psl';
import { parseTranco, unzipFirstFile } from './tranco';

const psl = parsePsl('com\nuk\nco.uk\n');

describe('unzipFirstFile', () => {
  it('extracts the CSV from a Tranco-style zip', () => {
    const zip = readFileSync(new URL('./fixtures/tranco-sample.zip', import.meta.url));
    const csv = unzipFirstFile(zip).toString('utf8');
    expect(csv.split(/\r?\n/)[0]).toBe('1,google.com');
    expect(csv).toContain('5,facebook.com');
  });
});

describe('parseTranco', () => {
  const csv = '1,google.com\r\n2,www.google.com\r\n3,co.uk\r\n4,bbc.co.uk\r\n5,facebook.com\r\n';

  it('maps registrable domains to their best rank, skipping suffixes', () => {
    expect(parseTranco(csv, psl, 100)).toEqual(
      new Map([
        ['google.com', 1],
        ['bbc.co.uk', 4],
        ['facebook.com', 5],
      ]),
    );
  });

  it('stops after the requested number of registrable domains', () => {
    expect([...parseTranco(csv, psl, 2).keys()]).toEqual(['google.com', 'bbc.co.uk']);
  });
});
