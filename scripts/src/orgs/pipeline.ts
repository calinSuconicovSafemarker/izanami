import { assignBrandTlds, type BrandTldInputs } from './brand-tlds';
import { diffOrgs, renderDiff } from './diff';
import { curatedDomains, curatedOwnership, mergeExtras, type Extra } from './extras';
import {
  OWNERSHIP_DEPTH,
  addRelatedDomains,
  type OwnedEntity,
  type PublishedDomains,
} from './related';
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
  /** Entities owned by / subsidiaries of the given entities (one level). */
  queryOwned(parentIds: readonly string[]): Promise<OwnedEntity[]>;
  /** Vendor-published domain lists, downloaded and parsed. */
  publishedLists(): Promise<PublishedDomains[]>;
  /** How many ownership API responses were unavailable (cache-only build); 0 or absent = complete. */
  ownershipGaps?(): number;
  /** IANA root zone, ICANN .brand flags and the curated operator mapping (ticket 14). */
  brandTlds(): Promise<BrandTldInputs>;
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
  /** Parent entities per ownership SPARQL request. */
  ownedBatchSize: number;
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
  const extras = await sources.extras();
  const merged = mergeExtras(generated, extras, allRanks, options.confirmedAt);

  // Ownership graph, two levels below every org (ticket 15).
  const owned: OwnedEntity[] = [];
  let parents = merged.map((o) => o.wikidataId);
  const visited = new Set(parents);
  for (let level = 1; level <= OWNERSHIP_DEPTH && parents.length; level++) {
    const found: OwnedEntity[] = [];
    for (let i = 0; i < parents.length; i += options.ownedBatchSize) {
      found.push(...(await sources.queryOwned(parents.slice(i, i + options.ownedBatchSize))));
    }
    owned.push(...found);
    parents = [...new Set(found.map((e) => e.wikidataId))].filter((id) => !visited.has(id)).sort();
    parents.forEach((id) => visited.add(id));
  }

  const related = addRelatedDomains(merged, allRanks, {
    owned: [...curatedOwnership(extras), ...owned],
    published: await sources.publishedLists(),
    curated: curatedDomains(extras),
  });
  const { orgs, notes: brandNotes } = assignBrandTlds(related.orgs, await sources.brandTlds());
  const { skipped } = related;
  const previous = (await sources.previousOrgs()) ?? [];
  const gaps = sources.ownershipGaps?.() ?? 0;
  const notes = [
    ...(gaps
      ? [
          `Ownership crawl partial: ${gaps} Wikidata API responses were unavailable, so some ` +
            'wikidata-owned related domains are missing. Rerun without BUILD_DATA_OWNERSHIP=cache-only.',
        ]
      : []),
    ...brandNotes,
  ];
  return { orgs, diffMarkdown: renderDiff({ ...diffOrgs(previous, orgs), skipped, notes }) };
}
