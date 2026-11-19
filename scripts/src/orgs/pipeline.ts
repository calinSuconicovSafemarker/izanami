import { assignBrandTlds, type BrandTldInputs } from './brand-tlds';
import { diffOrgs, renderDiff } from './diff';
import { curatedDomains, curatedOwnership, mergeExtras, type Extra } from './extras';
import {
  OWNERSHIP_DEPTH,
  addRelatedDomains,
  type OwnedEntity,
  type PublishedDomains,
} from './related';
import { selectOrgs, type Org, type PinnedOrg } from './select';
import { rankedDomains, type PopularityBucket, type PopularityMap } from '../lib/popularity';
import { classifyEntities, mergeEntities, type WikidataEntity } from './wikidata';

/** Everything the pipeline reads from the outside world, injected so tests can stub it. */
export interface OrgsSources {
  /** Combined popularity lists (Majestic Million, CrUX), registrable domain → popularity. */
  popularity(): Promise<PopularityMap>;
  queryEntities(domains: readonly string[]): Promise<Map<string, WikidataEntity>>;
  /** Class → all its superclasses (P279*), for the given P31 classes. */
  queryClassAncestors(classes: readonly string[]): Promise<Map<string, string[]>>;
  extras(): Promise<Extra[]>;
  /** Organisations kept beyond the cap (`scripts/data/pinned-orgs.json`). */
  pinnedOrgs(): Promise<PinnedOrg[]>;
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
  /** Registrable domains in this popularity bucket or better are looked up in Wikidata (10k). */
  candidateBucket: PopularityBucket;
  /** How many popularity-confirmed orgs to keep (1000), pinned orgs not counted. */
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
  const popularity = await sources.popularity();
  const candidates = new Map(
    [...popularity].filter(([, p]) => p.bucket <= options.candidateBucket),
  );
  const domains = rankedDomains(candidates);

  const entities = new Map<string, WikidataEntity>();
  for (let i = 0; i < domains.length; i += options.batchSize) {
    mergeEntities(entities, await sources.queryEntities(domains.slice(i, i + options.batchSize)));
  }

  const classes = [...new Set([...entities.values()].flatMap((e) => e.classes))].sort();
  const ancestors = new Map<string, string[]>();
  for (let i = 0; i < classes.length; i += options.classBatchSize) {
    const batch = await sources.queryClassAncestors(classes.slice(i, i + options.classBatchSize));
    batch.forEach((supers, cls) => ancestors.set(cls, supers));
  }

  const pinned = await sources.pinnedOrgs();
  const generated = selectOrgs({
    entities: classifyEntities(entities, ancestors),
    popularity: candidates,
    limit: options.limit,
    pinned: new Set(pinned.map((p) => p.wikidataId)),
    confirmedAt: options.confirmedAt,
  });
  const extras = await sources.extras();
  const merged = mergeExtras(generated, extras, popularity, options.confirmedAt);

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

  const related = addRelatedDomains(merged, popularity, {
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
    ...pinned
      .filter((p) => !orgs.some((o) => o.wikidataId === p.wikidataId))
      .map(
        (p) =>
          `Pinned org ${p.name} (${p.wikidataId}) is missing: no Wikidata P856 domain in the ` +
          'top-10k popularity bucket, or another entity claims it.',
      ),
    ...brandNotes,
  ];
  return { orgs, diffMarkdown: renderDiff({ ...diffOrgs(previous, orgs), skipped, notes }) };
}
