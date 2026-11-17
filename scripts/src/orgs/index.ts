import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
// Root devDependency, shared by all workspaces.
import { format, resolveConfig } from 'prettier';
import { parseExtras } from './extras';
import { cached, fetchWithRetry, sha256 } from './net';
import { runOrgsPipeline, type OrgsSources } from './pipeline';
import type { Org } from './select';
import { unzipFirstFile } from './tranco';
import {
  buildClassQuery,
  buildEntityQuery,
  parseClassAncestors,
  parseEntityBindings,
} from './wikidata';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../..');
const ORGS_JSON = join(REPO, 'web/src/data/orgs.json');
const DIFF_MD = join(REPO, 'web/src/data/data-diff.md');
const EXTRAS_JSON = join(REPO, 'scripts/data/extras.json');

const PSL_URL = 'https://publicsuffix.org/list/public_suffix_list.dat';
const TRANCO_URL = 'https://tranco-list.eu/top-1m.csv.zip';
const SPARQL_URL = 'https://query.wikidata.org/sparql';

/**
 * Pause before each uncached WDQS request. 1 s is polite normally; set
 * `BUILD_DATA_SPARQL_DELAY_MS=61000` when WDQS is rate-limiting to 1 request/minute.
 */
const SPARQL_DELAY_MS = Number(process.env.BUILD_DATA_SPARQL_DELAY_MS) || 1000;

/** Runs a SPARQL query (cached by its hash) and returns the parsed JSON. */
async function sparql(query: string): Promise<unknown> {
  const body = await cached(`sparql-${sha256(query).slice(0, 16)}.json`, async () => {
    await sleep(SPARQL_DELAY_MS);
    return fetchWithRetry(SPARQL_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query }).toString(),
    });
  });
  return JSON.parse(body.toString('utf8'));
}

/** Real (network + filesystem) sources; downloads are cached under `scripts/.cache/orgs`. */
const liveSources: OrgsSources = {
  async pslText() {
    return (await cached('public_suffix_list.dat', () => fetchWithRetry(PSL_URL))).toString();
  },
  async trancoCsv() {
    const zip = await cached('tranco-top-1m.csv.zip', () => fetchWithRetry(TRANCO_URL));
    return unzipFirstFile(zip).toString('utf8');
  },
  async queryEntities(domains) {
    return parseEntityBindings(await sparql(buildEntityQuery(domains)));
  },
  async queryClassAncestors(classes) {
    return parseClassAncestors(await sparql(buildClassQuery(classes)));
  },
  async extras() {
    return parseExtras(JSON.parse(await readFile(EXTRAS_JSON, 'utf8')));
  },
  async previousOrgs() {
    if (!existsSync(ORGS_JSON)) return null;
    return JSON.parse(await readFile(ORGS_JSON, 'utf8')) as Org[];
  },
};

/** Generates `web/src/data/orgs.json` and `data-diff.md` (ticket 01, ADR-0002). */
export async function buildOrgs(): Promise<void> {
  console.log('orgs: resolving official domains from Wikidata P856 + Tranco');
  const { orgs, diffMarkdown } = await runOrgsPipeline(liveSources, {
    candidateDomains: 10_000,
    limit: 500,
    batchSize: 500,
    classBatchSize: 200,
    confirmedAt: new Date().toISOString().slice(0, 10),
  });
  await mkdir(dirname(ORGS_JSON), { recursive: true });
  await writeFormatted(ORGS_JSON, JSON.stringify(orgs, null, 2));
  await writeFormatted(DIFF_MD, diffMarkdown);
  const extras = orgs.filter((o) => o.wikidataDomain === null).length;
  console.log(`orgs: wrote ${orgs.length} organisations (${extras} curated-only) to orgs.json`);
}

/** Writes generated output formatted with the repo Prettier config, so `npm run lint` passes. */
async function writeFormatted(path: string, content: string): Promise<void> {
  const options = (await resolveConfig(path)) ?? {};
  await writeFile(path, await format(content, { ...options, filepath: path }));
}
