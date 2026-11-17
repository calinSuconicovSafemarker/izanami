import { rootUrlsFor } from './domains';

/** A Wikidata entity that lists at least one official website (P856). */
export interface WikidataEntity {
  wikidataId: string;
  name: string;
  sitelinks: number;
  /** ISO 3166-1 alpha-2 codes of P17 (country), else of the HQ country; sorted. */
  countries: string[];
  /** All P856 values, sorted. */
  websites: string[];
}

/** SPARQL selecting entities whose P856 is the homepage of one of `domains`, with all their P856. */
export function buildEntityQuery(domains: readonly string[]): string {
  const roots = domains.flatMap(rootUrlsFor).map((url) => `<${url}>`);
  return `SELECT ?item ?label ?mulLabel ?site ?sitelinks ?iso ?hqIso WHERE {
  VALUES ?root { ${roots.join(' ')} }
  ?item wdt:P856 ?root .
  ?item wdt:P856 ?site .
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q13406463 . }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 . }
  OPTIONAL { ?item wikibase:sitelinks ?sitelinks . }
  OPTIONAL { ?item wdt:P17/wdt:P297 ?iso . }
  OPTIONAL { ?item wdt:P159/wdt:P17/wdt:P297 ?hqIso . }
  OPTIONAL { ?item rdfs:label ?label . FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item rdfs:label ?mulLabel . FILTER(LANG(?mulLabel) = "mul") }
}`;
}

interface Term {
  value: string;
}
type Binding = Partial<
  Record<'item' | 'label' | 'mulLabel' | 'site' | 'sitelinks' | 'iso' | 'hqIso', Term>
>;

function bindingsOf(json: unknown): Binding[] {
  const bindings = (json as { results?: { bindings?: unknown } } | null)?.results?.bindings;
  if (!Array.isArray(bindings)) throw new Error('Unexpected SPARQL response: no results.bindings');
  return bindings as Binding[];
}

/**
 * Groups SPARQL JSON rows into entities keyed by Q-id. Name: English label, else the `mul` label
 * (entities with neither are dropped). Countries: P17, else the headquarters (P159) country.
 */
export function parseEntityBindings(json: unknown): Map<string, WikidataEntity> {
  const entities = new Map<string, WikidataEntity>();
  const hqCountries = new Map<string, string[]>();
  for (const row of bindingsOf(json)) {
    const id = row.item?.value.split('/').pop();
    const name = (row.label ?? row.mulLabel)?.value.trim();
    if (!id || !/^Q\d+$/.test(id) || !name) continue;
    let entity = entities.get(id);
    if (!entity) {
      entity = { wikidataId: id, name, sitelinks: 0, countries: [], websites: [] };
      entities.set(id, entity);
    }
    entity.sitelinks = Math.max(entity.sitelinks, Number(row.sitelinks?.value ?? 0) || 0);
    addSorted(entity.countries, row.iso?.value.toUpperCase());
    const hq = hqCountries.get(id) ?? [];
    addSorted(hq, row.hqIso?.value.toUpperCase());
    hqCountries.set(id, hq);
    addSorted(entity.websites, row.site?.value);
  }
  for (const entity of entities.values()) {
    if (!entity.countries.length) entity.countries = hqCountries.get(entity.wikidataId) ?? [];
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
    entity.countries.forEach((c) => addSorted(existing.countries, c));
    entity.websites.forEach((w) => addSorted(existing.websites, w));
  }
}

function addSorted(list: string[], value: string | undefined): void {
  if (!value || list.includes(value)) return;
  list.push(value);
  list.sort();
}
