import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeDomainSet } from '../lib/web';
import { buildDatasets, SOURCES } from './index';

const MAJESTIC_HEADER = 'GlobalRank,TldRank,Domain,TLD,RefSubNets,RefIPs\n';

const FIXTURES: Record<string, Uint8Array> = {
  [SOURCES.majestic]: Buffer.from(
    `${MAJESTIC_HEADER}1,1,google.com,com,1,1\n2,1,tudelft.nl,nl,1,1\n200000,9,third.org,org,1,1\n`,
  ),
  [SOURCES.crux]: gzipSync(
    'origin,rank\nhttps://www.only-in-crux.de,50000\nhttps://fourth.net,1000000\n',
  ),
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
      fetchBytes: async (url) => FIXTURES[url] ?? Promise.reject(new Error(`unexpected ${url}`)),
      log: (msg) => logs.push(msg),
    });

    const read = async (f: string) => JSON.parse(await readFile(join(outDir, f), 'utf8'));
    const popular = decodeDomainSet(await read('popular-top100k.json'));
    expect(popular.has('google.com')).toBe(true);
    expect(popular.has('tudelft.nl')).toBe(true);
    expect(popular.has('only-in-crux.de')).toBe(true);
    expect(popular.has('third.org')).toBe(false);
    expect(popular.has('fourth.net')).toBe(false);
    expect((await read('confusables.json'))['е']).toBe('e');
    expect((await read('rdap-hosts.json')).servers.nl).toBe('https://rdap.sidn.nl/');

    for (const f of ['popular-top100k.json', 'confusables.json', 'rdap-hosts.json']) {
      expect(logs.some((l) => l.includes(f) && /\d+(\.\d+)? KB/.test(l))).toBe(true);
    }
  });
});
