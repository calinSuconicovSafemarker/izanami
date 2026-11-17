import { diffOrgs, renderDiff } from './diff';
import { mergeExtras, type Extra } from './extras';
import { selectOrgs, type Org } from './select';
import { parseTranco } from '../lib/tranco';
import { classifyEntities, mergeEntities, type WikidataEntity } from './wikidata';

/** Everything the pipeline reads from the outside world, injected so tests can stub it. */
export interface OrgsSources {
  trancoCsv(): Promise<string>;
  queryEntities(domains: readonly string[]): Promise<Map<string, WikidataEntity>>;
  /** Class → all its superclasses (P279*), for the given P31 classes. */
  queryClassAncestors(classes: readonly string[]): Promise<Map<string, string[]>>;
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
  /** Classes per class-ancestry SPARQL request. */
  classBatchSize: number;
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
  const csv = await sources.trancoCsv();
  const allRanks = parseTranco(csv, Number.POSITIVE_INFINITY);
  const candidates = new Map([...allRanks].slice(0, options.candidateDomains));

  const entities = new Map<string, WikidataEntity>();
  const domains = [...candidates.keys()];
  for (let i = 0; i < domains.length; i += options.batchSize) {
    mergeEntities(entities, await sources.queryEntities(domains.slice(i, i + options.batchSize)));
  }

  const classes = [...new Set([...entities.values()].flatMap((e) => e.classes))].sort();
  const ancestors = new Map<string, string[]>();
  for (let i = 0; i < classes.length; i += options.classBatchSize) {
    const batch = await sources.queryClassAncestors(classes.slice(i, i + options.classBatchSize));
    batch.forEach((supers, cls) => ancestors.set(cls, supers));
  }

  const generated = selectOrgs({
    entities: classifyEntities(entities, ancestors),
    tranco: candidates,
    limit: options.limit,
    confirmedAt: options.confirmedAt,
  });
  const orgs = mergeExtras(generated, await sources.extras(), allRanks, options.confirmedAt);
  const previous = (await sources.previousOrgs()) ?? [];
  return { orgs, diffMarkdown: renderDiff(diffOrgs(previous, orgs)) };
}
