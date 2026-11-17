import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { encodeDomainSet } from '../../../web/src/lib/domain-set';
import { parseConfusables } from './confusables';
import { parseRdapBootstrap } from './rdap';
import { trancoTopDomains } from './tranco';

export const SOURCES = {
  tranco: 'https://tranco-list.eu/top-1m.csv.zip',
  confusables: 'https://www.unicode.org/Public/security/latest/confusables.txt',
  rdapBootstrap: 'https://data.iana.org/rdap/dns.json',
} as const;

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = join(here, '../../../web/src/data');
const DEFAULT_CACHE_DIR = join(here, '../../.cache');
const USER_AGENT = 'lookalike-checker-build-data/0.1 (static dataset generator)';

export interface BuildDatasetsOptions {
  outDir?: string;
  trancoSize?: number;
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  log?: (msg: string) => void;
}

/** Downloads once per URL into a gitignored cache folder; later runs reuse the file. */
export function cachedFetch(cacheDir = DEFAULT_CACHE_DIR) {
  return async (url: string): Promise<Uint8Array> => {
    const file = join(cacheDir, new URL(url).pathname.split('/').pop() || 'download');
    try {
      return await readFile(file);
    } catch {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
      if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, bytes);
      return bytes;
    }
  };
}

/** Generates `tranco-top100k.json`, `confusables.json` and `rdap-hosts.json` (ticket 02). */
export async function buildDatasets(options: BuildDatasetsOptions = {}): Promise<void> {
  const {
    outDir = DEFAULT_OUT_DIR,
    trancoSize = 100_000,
    fetchBytes = cachedFetch(),
    log = console.log,
  } = options;
  const text = async (url: string) => Buffer.from(await fetchBytes(url)).toString('utf8');

  const [trancoZip, confusablesTxt, bootstrapJson] = await Promise.all([
    fetchBytes(SOURCES.tranco),
    text(SOURCES.confusables),
    text(SOURCES.rdapBootstrap),
  ]);

  const outputs: Record<string, unknown> = {
    'tranco-top100k.json': encodeDomainSet(trancoTopDomains(trancoZip, trancoSize)),
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
