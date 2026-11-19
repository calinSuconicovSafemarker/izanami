import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { cachedDownload } from '../lib/net';
import {
  CRUX_URL,
  downloadPopularityList,
  loadPopularity,
  MAJESTIC_URL,
  rankedDomains,
  type PopularityBucket,
} from '../lib/popularity';
import { encodeDomainSet } from '../lib/web';
import { parseConfusables } from './confusables';
import { parseRdapBootstrap } from './rdap';

export const SOURCES = {
  majestic: MAJESTIC_URL,
  crux: CRUX_URL,
  confusables: 'https://www.unicode.org/Public/security/latest/confusables.txt',
  rdapBootstrap: 'https://data.iana.org/rdap/dns.json',
} as const;

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = join(here, '../../../web/src/data');
export interface BuildDatasetsOptions {
  outDir?: string;
  /** Domains in this popularity bucket or better go into the runtime set (top 100k). */
  popularBucket?: PopularityBucket;
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  log?: (msg: string) => void;
}

/** Generates `popular-top100k.json`, `confusables.json` and `rdap-hosts.json` (tickets 02, 19). */
export async function buildDatasets(options: BuildDatasetsOptions = {}): Promise<void> {
  const {
    outDir = DEFAULT_OUT_DIR,
    popularBucket = 100_000,
    fetchBytes,
    log = console.log,
  } = options;
  const download = fetchBytes ?? cachedDownload;
  const text = async (url: string) => Buffer.from(await download(url)).toString('utf8');

  const [popularity, confusablesTxt, bootstrapJson] = await Promise.all([
    loadPopularity(fetchBytes ?? downloadPopularityList),
    text(SOURCES.confusables),
    text(SOURCES.rdapBootstrap),
  ]);

  const outputs: Record<string, unknown> = {
    'popular-top100k.json': encodeDomainSet(
      rankedDomains(popularity).filter((d) => (popularity.get(d)?.bucket ?? 0) <= popularBucket),
    ),
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
