import { diffOrgs, renderDiff } from './diff';
import { mergeExtras, type Extra } from './extras';
import { parsePsl } from './psl';
import { selectOrgs, type Org } from './select';
import { parseTranco } from './tranco';
import { mergeEntities, type WikidataEntity } from './wikidata';

/** Everything the pipeline reads from the outside world, injected so tests can stub it. */
export interface OrgsSources {
  pslText(): Promise<string>;
  trancoCsv(): Promise<string>;
  queryEntities(domains: readonly string[]): Promise<Map<string, WikidataEntity>>;
  extras(): Promise<Extra[]>;
  previousOrgs(): Promise<Org[] | null>;
}

export interface OrgsOptions {
  /** How many top Tranco registrable domains to look up in Wikidata (~10k). */
  candidateDomains: number;
  /** How many Tranco-confirmed orgs to keep (500). */
  limit: number;
  /** Domains per SPARQL request. */
  batchSize: number;
  confirmedAt: string;
}

export interface OrgsResult {
  orgs: Org[];
  diffMarkdown: string;
}

export async function runOrgsPipeline(
  sources: OrgsSources,
  options: OrgsOptions,
): Promise<OrgsResult> {
  const psl = parsePsl(await sources.pslText());
  const csv = await sources.trancoCsv();
  const allRanks = parseTranco(csv, psl, Number.POSITIVE_INFINITY);
  const candidates = new Map([...allRanks].slice(0, options.candidateDomains));

  const entities = new Map<string, WikidataEntity>();
  const domains = [...candidates.keys()];
  for (let i = 0; i < domains.length; i += options.batchSize) {
    mergeEntities(entities, await sources.queryEntities(domains.slice(i, i + options.batchSize)));
  }

  const generated = selectOrgs({
    entities,
    tranco: candidates,
    psl,
    limit: options.limit,
    confirmedAt: options.confirmedAt,
  });
  const orgs = mergeExtras(generated, await sources.extras(), allRanks, options.confirmedAt);
  const previous = (await sources.previousOrgs()) ?? [];
  return { orgs, diffMarkdown: renderDiff(diffOrgs(previous, orgs)) };
}
