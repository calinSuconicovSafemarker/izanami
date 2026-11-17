import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zipOf } from '../lib/zip-fixture';
import { decodeDomainSet } from '../lib/web';
import { buildDatasets, SOURCES } from './index';

const FIXTURES: Record<string, Uint8Array> = {
  [SOURCES.tranco]: zipOf('top-1m.csv', '1,google.com\n2,tudelft.nl\n3,third.org\n'),
  [SOURCES.confusables]: Buffer.from(
    '0435 ;\t0065 ;\tMA\t# ( е → e ) CYRILLIC SMALL LETTER IE → LATIN SMALL LETTER E\n',
  ),
  [SOURCES.rdapBootstrap]: Buffer.from(
    JSON.stringify({ services: [[['nl'], ['https://rdap.sidn.nl/']]] }),
  ),
};

describe('buildDatasets', () => {
  let outDir: string;
  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'datasets-'));
  });
  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it('writes the three runtime datasets and logs each file size', async () => {
    const logs: string[] = [];
    await buildDatasets({
      outDir,
      trancoSize: 2,
      fetchBytes: async (url) => FIXTURES[url] ?? Promise.reject(new Error(`unexpected ${url}`)),
      log: (msg) => logs.push(msg),
    });

    const read = async (f: string) => JSON.parse(await readFile(join(outDir, f), 'utf8'));
    const tranco = decodeDomainSet(await read('tranco-top100k.json'));
    expect(tranco.has('google.com')).toBe(true);
    expect(tranco.has('tudelft.nl')).toBe(true);
    expect(tranco.has('third.org')).toBe(false);
    expect((await read('confusables.json'))['е']).toBe('e');
    expect((await read('rdap-hosts.json')).servers.nl).toBe('https://rdap.sidn.nl/');

    for (const f of ['tranco-top100k.json', 'confusables.json', 'rdap-hosts.json']) {
      expect(logs.some((l) => l.includes(f) && /\d+(\.\d+)? KB/.test(l))).toBe(true);
    }
  });
});
