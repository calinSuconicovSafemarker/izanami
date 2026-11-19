import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { parseBrandTldsConfig, parseRootZoneDb, parseSpecification13 } from './brand-tlds';
import { parseExtras } from './extras';
import { queryOwnedViaApi } from './ownership';
import { parsePublishedList, parsePublishedListsConfig } from './related';
import { CACHE_DIR, cached, fetchWithRetry, sha256 } from '../lib/net';
import { trancoCsv } from '../lib/tranco';
import { runOrgsPipeline, type OrgsSources } from './pipeline';
import type { Org } from './select';
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
const PUBLISHED_LISTS_JSON = join(REPO, 'scripts/data/published-lists.json');
const BRAND_TLDS_JSON = join(REPO, 'scripts/data/brand-tlds.json');

/** Every delegated TLD with its manager, on one page (cached; refetch with BUILD_DATA_REFRESH=1). */
const IANA_ROOT_ZONE_DB = 'https://www.iana.org/domains/root/db';
/** ICANN's registry-agreement list; `specification13` marks the .brand TLDs. */
const ICANN_GTLDS_JSON = 'https://www.icann.org/resources/registries/gtlds/v2/gtlds.json';

const SPARQL_URL = 'https://query.wikidata.org/sparql';

/**
 * Pause before each uncached WDQS request. 1 s is polite normally; set
 * `BUILD_DATA_SPARQL_DELAY_MS=61000` when WDQS is rate-limiting to 1 request/minute.
 */
const SPARQL_DELAY_MS = Number(process.env.BUILD_DATA_SPARQL_DELAY_MS) || 1000;

/** Runs a SPARQL query (cached by its hash) and returns the parsed JSON. */
async function sparql(query: string): Promise<unknown> {
  const body = await cached(`orgs/sparql-${sha256(query).slice(0, 16)}.json`, async () => {
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

const API_URL = 'https://www.wikidata.org/w/api.php';

/**
 * Wikidata Action API GET (cached by its URL). `maxlag=5` asks the API to refuse work while the
 * servers are lagged; such refusals (and "search too busy") are waited out and never cached.
 * Uncached requests are paced one per second.
 */
async function wikidataApi(params: Record<string, string>): Promise<unknown> {
  const url = `${API_URL}?${new URLSearchParams({ ...params, format: 'json', maxlag: '5' })}`;
  const name = `orgs/api-${sha256(url).slice(0, 16)}.json`;
  if (CACHE_ONLY && !existsSync(join(CACHE_DIR, name))) {
    apiGaps++;
    return null;
  }
  for (let attempt = 1; ; attempt++) {
    const body = await cached(name, async () => {
      await sleep(API_DELAY_MS);
      return fetchWithRetry(url);
    });
    const json = JSON.parse(body.toString('utf8')) as { error?: { code?: string; info?: string } };
    if (!json.error) return json;
    await rm(join(CACHE_DIR, name), { force: true });
    if (!RETRYABLE_API_ERRORS.has(json.error.code ?? '') || attempt >= 8) {
      throw new Error(`Wikidata API error ${json.error.code}: ${json.error.info}`);
    }
    console.warn(`  Wikidata API ${json.error.code}; retrying in ${15 * attempt}s`);
    await sleep(15_000 * attempt);
  }
}

const API_DELAY_MS = 1000;

/**
 * `BUILD_DATA_OWNERSHIP=cache-only` builds the ownership graph from cached API responses only
 * (when Wikidata is overloaded); missing parts are skipped and reported in data-diff.md.
 */
const CACHE_ONLY = process.env.BUILD_DATA_OWNERSHIP === 'cache-only';
let apiGaps = 0;
const RETRYABLE_API_ERRORS = new Set(['maxlag', 'cirrussearch-too-busy-error']);

/** Real (network + filesystem) sources; downloads are cached under `scripts/.cache`. */
const liveSources: OrgsSources = {
  trancoCsv: () => trancoCsv(),
  async queryEntities(domains) {
    return parseEntityBindings(await sparql(buildEntityQuery(domains)));
  },
  async queryClassAncestors(classes) {
    return parseClassAncestors(await sparql(buildClassQuery(classes)));
  },
  async extras() {
    return parseExtras(JSON.parse(await readFile(EXTRAS_JSON, 'utf8')));
  },
  async queryOwned(parentIds) {
    return queryOwnedViaApi(parentIds, wikidataApi);
  },
  async publishedLists() {
    const configs = parsePublishedListsConfig(
      JSON.parse(await readFile(PUBLISHED_LISTS_JSON, 'utf8')),
    );
    const lists = [];
    for (const config of configs) {
      const body = await cached(`related/list-${sha256(config.url).slice(0, 16)}.txt`, () =>
        fetchWithRetry(config.url),
      );
      const domains = parsePublishedList(config, body.toString('utf8'));
      console.log(`orgs: ${config.name}: ${domains.length} domains`);
      lists.push({
        wikidataId: config.wikidataId,
        name: config.name,
        url: config.docs ?? config.url,
        domains,
      });
    }
    return lists;
  },
  ownershipGaps: () => apiGaps,
  async brandTlds() {
    const rootZone = await cached('brand-tlds/root-db.html', () =>
      fetchWithRetry(IANA_ROOT_ZONE_DB),
    );
    const gtlds = await cached('brand-tlds/gtlds.json', () => fetchWithRetry(ICANN_GTLDS_JSON));
    return {
      rootZone: parseRootZoneDb(rootZone.toString('utf8')),
      specification13: parseSpecification13(JSON.parse(gtlds.toString('utf8'))),
      operators: parseBrandTldsConfig(JSON.parse(await readFile(BRAND_TLDS_JSON, 'utf8'))),
    };
  },
  async previousOrgs() {
    if (!existsSync(ORGS_JSON)) return null;
    return JSON.parse(await readFile(ORGS_JSON, 'utf8')) as Org[];
  },
};

/** Generates `web/src/data/orgs.json` and `data-diff.md` (ticket 01, ADR-0002). */
export async function buildOrgs(): Promise<void> {
  console.log('orgs: resolving official domains from Wikidata P856 + Tranco, related domains');
  const { orgs, diffMarkdown } = await runOrgsPipeline(liveSources, {
    candidateDomains: 10_000,
    limit: 500,
    batchSize: 500,
    classBatchSize: 200,
    ownedBatchSize: 200,
    confirmedAt: new Date().toISOString().slice(0, 10),
  });
  await mkdir(dirname(ORGS_JSON), { recursive: true });
  await writeFormatted(ORGS_JSON, JSON.stringify(orgs, null, 2));
  await writeFormatted(DIFF_MD, diffMarkdown);
  const extras = orgs.filter((o) => o.wikidataDomain === null).length;
  const related = orgs.reduce((n, o) => n + o.relatedDomains.length, 0);
  const brand = orgs.reduce((n, o) => n + o.brandTlds.length, 0);
  console.log(
    `orgs: wrote ${orgs.length} organisations (${extras} curated-only, ${related} related ` +
      `domains, ${brand} brand TLDs)`,
  );
}

/** Writes generated output formatted with the repo Prettier config, so `npm run lint` passes. */
async function writeFormatted(path: string, content: string): Promise<void> {
  const options = (await resolveConfig(path)) ?? {};
  await writeFile(path, await format(content, { ...options, filepath: path }));
}
