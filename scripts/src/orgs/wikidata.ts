import { rootUrlsFor } from './domains';

/** A Wikidata entity that lists at least one official website (P856). */
export interface WikidataEntity {
  wikidataId: string;
  name: string;
  sitelinks: number;
  /**
   * Whether the entity is an organisation (P31/P279* Q43229) rather than a product, service or
   * website. Set by `classifyEntities`; the entity query alone leaves it false.
   */
  isOrganisation: boolean;
  /** Direct P31 classes (Q-ids), sorted. */
  classes: string[];
  /**
   * ISO 3166-1 alpha-2 codes of P17 (country), else of the HQ (P159) country, else of the
   * country of origin (P495); sorted.
   */
  countries: string[];
  /** All non-deprecated P856 values, sorted. */
  websites: string[];
}

/** Organisation (Q43229): preferred when several entities claim the same domain. */
export const ORGANISATION_CLASS = 'Q43229';

/**
 * Classes that are never an organisation's identity even when they list a P856: software
 * ("Microsoft Office", "Snowflake ID"), concepts, Wikimedia list articles and humans.
 */
export const EXCLUDED_CLASSES = ['Q7397', 'Q151885', 'Q13406463', 'Q5'] as const;

/** Statement-level P856 match that keeps normal-rank values (X lists twitter.com as normal). */
const p856 = (value: string, n: string) =>
  `?item p:P856 ?st${n} . ?st${n} ps:P856 ${value} ; wikibase:rank ?rank${n} .
  FILTER(?rank${n} != wikibase:DeprecatedRank)`;

/**
 * SPARQL selecting entities whose P856 is the homepage of one of `domains`, with all their
 * non-deprecated P856 and their direct P31 classes. Class ancestry is resolved separately
 * (`buildClassQuery`): an inline `wdt:P31/wdt:P279*` check times out on WDQS.
 */
export function buildEntityQuery(domains: readonly string[]): string {
  const roots = domains.flatMap(rootUrlsFor).map((url) => `<${url}>`);
  return `SELECT ?item ?label ?mulLabel ?site ?sitelinks ?class ?iso ?hqIso ?originIso WHERE {
  VALUES ?root { ${roots.join(' ')} }
  ${p856('?root', 'Root')}
  ${p856('?site', 'Site')}
  OPTIONAL { ?item wdt:P31 ?class . }
  OPTIONAL { ?item wikibase:sitelinks ?sitelinks . }
  OPTIONAL { ?item wdt:P17/wdt:P297 ?iso . }
  OPTIONAL { ?item wdt:P159/wdt:P17/wdt:P297 ?hqIso . }
  OPTIONAL { ?item wdt:P495/wdt:P297 ?originIso . }
  OPTIONAL { ?item rdfs:label ?label . FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item rdfs:label ?mulLabel . FILTER(LANG(?mulLabel) = "mul") }
}`;
}

/** SPARQL listing every superclass (P279*, including itself) of each class. */
export function buildClassQuery(classes: readonly string[]): string {
  return `SELECT ?class ?super WHERE {
  VALUES ?class { ${classes.map((c) => `wd:${c}`).join(' ')} }
  ?class wdt:P279* ?super .
}`;
}

interface Term {
  value: string;
}
type Binding = Partial<
  Record<
    | 'item'
    | 'label'
    | 'mulLabel'
    | 'site'
    | 'sitelinks'
    | 'class'
    | 'super'
    | 'iso'
    | 'hqIso'
    | 'originIso',
    Term
  >
>;

const qid = (term: Term | undefined) => {
  const id = term?.value.split('/').pop();
  return id && /^Q\d+$/.test(id) ? id : undefined;
};

function bindingsOf(json: unknown): Binding[] {
  const bindings = (json as { results?: { bindings?: unknown } } | null)?.results?.bindings;
  if (!Array.isArray(bindings)) throw new Error('Unexpected SPARQL response: no results.bindings');
  return bindings as Binding[];
}

/**
 * Groups SPARQL JSON rows into entities keyed by Q-id. Name: English label, else the `mul` label
 * (entities with neither are dropped). Countries: P17, else the headquarters (P159) country,
 * else the country of origin (P495).
 */
export function parseEntityBindings(json: unknown): Map<string, WikidataEntity> {
  const entities = new Map<string, WikidataEntity>();
  const fallbacks = new Map<string, { hq: string[]; origin: string[] }>();
  for (const row of bindingsOf(json)) {
    const id = qid(row.item);
    const name = (row.label ?? row.mulLabel)?.value.trim();
    if (!id || !name) continue;
    let entity = entities.get(id);
    if (!entity) {
      entity = {
        wikidataId: id,
        name,
        sitelinks: 0,
        isOrganisation: false,
        classes: [],
        countries: [],
        websites: [],
      };
      entities.set(id, entity);
      fallbacks.set(id, { hq: [], origin: [] });
    }
    const fallback = fallbacks.get(id)!;
    entity.sitelinks = Math.max(entity.sitelinks, Number(row.sitelinks?.value ?? 0) || 0);
    addSorted(entity.classes, qid(row.class));
    addSorted(entity.countries, row.iso?.value.toUpperCase());
    addSorted(fallback.hq, row.hqIso?.value.toUpperCase());
    addSorted(fallback.origin, row.originIso?.value.toUpperCase());
    addSorted(entity.websites, row.site?.value);
  }
  for (const entity of entities.values()) {
    const { hq, origin } = fallbacks.get(entity.wikidataId)!;
    if (!entity.countries.length) entity.countries = hq.length ? hq : origin;
  }
  return entities;
}

/** Merges entity maps from several batches (an entity can match more than one batch). */
export function mergeEntities(
  target: Map<string, WikidataEntity>,
  source: Map<string, WikidataEntity>,
): void {
  for (const [id, entity] of source) {
    const existing = target.get(id);
    if (!existing) {
      target.set(id, entity);
      continue;
    }
    existing.sitelinks = Math.max(existing.sitelinks, entity.sitelinks);
    entity.classes.forEach((c) => addSorted(existing.classes, c));
    entity.countries.forEach((c) => addSorted(existing.countries, c));
    entity.websites.forEach((w) => addSorted(existing.websites, w));
  }
}

/** Groups class-query rows into class → all superclasses (including itself). */
export function parseClassAncestors(json: unknown): Map<string, string[]> {
  const ancestors = new Map<string, string[]>();
  for (const row of bindingsOf(json)) {
    const cls = qid(row.class);
    const sup = qid(row.super);
    if (!cls || !sup) continue;
    const list = ancestors.get(cls) ?? [];
    addSorted(list, sup);
    ancestors.set(cls, list);
  }
  return ancestors;
}

/**
 * Sets `isOrganisation` from the class ancestry and drops entities of an excluded class unless
 * they are also organisations.
 */
export function classifyEntities(
  entities: ReadonlyMap<string, WikidataEntity>,
  ancestors: ReadonlyMap<string, readonly string[]>,
): Map<string, WikidataEntity> {
  const excluded = new Set<string>(EXCLUDED_CLASSES);
  const kept = new Map<string, WikidataEntity>();
  for (const [id, entity] of entities) {
    const supers = new Set(entity.classes.flatMap((c) => [c, ...(ancestors.get(c) ?? [])]));
    const isOrganisation = supers.has(ORGANISATION_CLASS);
    if (!isOrganisation && [...supers].some((c) => excluded.has(c))) continue;
    kept.set(id, { ...entity, isOrganisation });
  }
  return kept;
}

function addSorted(list: string[], value: string | undefined): void {
  if (!value || list.includes(value)) return;
  list.push(value);
  list.sort();
}
