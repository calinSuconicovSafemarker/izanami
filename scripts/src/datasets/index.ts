import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { cachedDownload } from '../lib/net';
import { TRANCO_URL, trancoCsv, trancoTopDomains } from '../lib/tranco';
import { encodeDomainSet } from '../lib/web';
import { parseConfusables } from './confusables';
import { parseRdapBootstrap } from './rdap';

export const SOURCES = {
  tranco: TRANCO_URL,
  confusables: 'https://www.unicode.org/Public/security/latest/confusables.txt',
  rdapBootstrap: 'https://data.iana.org/rdap/dns.json',
} as const;

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = join(here, '../../../web/src/data');
export interface BuildDatasetsOptions {
  outDir?: string;
  trancoSize?: number;
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  log?: (msg: string) => void;
}

/** Generates `tranco-top100k.json`, `confusables.json` and `rdap-hosts.json` (ticket 02). */
export async function buildDatasets(options: BuildDatasetsOptions = {}): Promise<void> {
  const {
    outDir = DEFAULT_OUT_DIR,
    trancoSize = 100_000,
    fetchBytes = cachedDownload,
    log = console.log,
  } = options;
  const text = async (url: string) => Buffer.from(await fetchBytes(url)).toString('utf8');

  const [tranco, confusablesTxt, bootstrapJson] = await Promise.all([
    trancoCsv(fetchBytes),
    text(SOURCES.confusables),
    text(SOURCES.rdapBootstrap),
  ]);

  const outputs: Record<string, unknown> = {
    'tranco-top100k.json': encodeDomainSet(trancoTopDomains(tranco, trancoSize)),
    'confusables.json': parseConfusables(confusablesTxt),
    'rdap-hosts.json': parseRdapBootstrap(JSON.parse(bootstrapJson)),
  };

  await mkdir(outDir, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) {
    const json = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(join(outDir, name), json);
    const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
    log(`${name}: ${kb(Buffer.byteLength(json))} (${kb(gzipSync(json).length)} gzipped)`);
  }
}
