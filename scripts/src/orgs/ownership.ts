import type { OwnedEntity } from './related';

/**
 * The Wikidata ownership graph via the Action API (ticket 15). WDQS times out on reverse
 * P127/P749 lookups for hundreds of orgs, so children are found with CirrusSearch
 * (`haswbstatement`, an index lookup) and verified on the full entity JSON (`wbgetentities`),
 * where ranks and qualifiers are visible.
 *
 * Only children that list an official website (P856) are searched: they are the ones that can
 * contribute a domain, and the filter keeps ~500 orgs to a few thousand entities.
 */

/** Child → parent properties: owned by, parent organization. */
const CHILD_TO_PARENT = ['P127', 'P749'] as const;
/** Parent → child property: subsidiary. */
const PARENT_TO_CHILD = 'P355';

/** CirrusSearch queries finding items with a website owned by any of `parentIds`. */
export function ownershipSearches(parentIds: readonly string[], perQuery: number): string[] {
  const queries: string[] = [];
  for (let i = 0; i < parentIds.length; i += perQuery) {
    const alternatives = parentIds
      .slice(i, i + perQuery)
      .flatMap((id) => CHILD_TO_PARENT.map((p) => `${p}=${id}`));
    queries.push(`haswbstatement:P856 haswbstatement:${alternatives.join('|')}`);
  }
  return queries;
}

interface Snak {
  snaktype?: string;
  datavalue?: { value?: unknown };
}
interface Statement {
  rank?: string;
  mainsnak?: Snak;
  qualifiers?: Record<string, Snak[]>;
}
interface Entity {
  id?: string;
  missing?: string;
  labels?: Record<string, { value?: string }>;
  claims?: Record<string, Statement[]>;
}

/** Entity JSON keyed by id, from one or more `wbgetentities` responses. */
export type EntitiesJson = { entities?: Record<string, Entity> };

/**
 * A current, majority link: not deprecated, no end time (P582), and no share (P1107) below half.
 */
function isCurrentLink(statement: Statement): boolean {
  if (statement.rank === 'deprecated') return false;
  const q = statement.qualifiers ?? {};
  if (q.P582?.length) return false;
  const share = q.P1107?.map((s) => Number((s.datavalue?.value as { amount?: string })?.amount));
  return !share?.some((n) => Number.isFinite(n) && n < 0.5);
}

/**
 * More current P127 owners than this on one child: each is an investor, not a controlling
 * parent (Nothing Technology lists four funds; the WebPlatform consortium ten).
 */
const MAX_CONTROLLING_OWNERS = 2;

/** Dissolved/abolished (P576) or discontinued (P2669): its domains may have lapsed (R1). */
const LAPSED = ['P576', 'P2669'] as const;

const isLapsed = (entity: Entity) =>
  LAPSED.some((p) => (entity.claims?.[p] ?? []).some((s) => s.rank !== 'deprecated'));

function itemValue(statement: Statement): string | undefined {
  const id = (statement.mainsnak?.datavalue?.value as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
}

function websites(entity: Entity): string[] {
  const urls = (entity.claims?.P856 ?? [])
    .filter((s) => s.rank !== 'deprecated' && !s.qualifiers?.P582?.length)
    .map((s) => s.mainsnak?.datavalue?.value)
    .filter((v): v is string => typeof v === 'string');
  return [...new Set(urls)];
}

const qNumber = (id: string) => Number(id.slice(1));

/**
 * Ownership links among `entities` whose parent is one of `parentIds`: children naming a parent
 * in P127/P749, and parents naming a child in P355. Only current, controlling links count, and
 * dissolved or discontinued children are left out (their domains may have lapsed, R1). Children missing from
 * `entities` are skipped (a P355 child must be fetched too).
 */
export function ownedFromEntities(parentIds: readonly string[], json: unknown): OwnedEntity[] {
  const entities = (json as EntitiesJson | null)?.entities ?? {};
  const parents = new Set(parentIds);
  const links = new Map<string, { parentId: string; childId: string }>();
  const link = (parentId: string, childId: string) => {
    if (parentId !== childId) links.set(`${parentId}>${childId}`, { parentId, childId });
  };
  for (const [id, entity] of Object.entries(entities)) {
    if (entity.missing !== undefined) continue;
    const owners = (entity.claims?.P127 ?? []).filter(isCurrentLink).length;
    for (const prop of CHILD_TO_PARENT) {
      if (prop === 'P127' && owners > MAX_CONTROLLING_OWNERS) continue;
      for (const statement of entity.claims?.[prop] ?? []) {
        const parent = itemValue(statement);
        if (parent && parents.has(parent) && isCurrentLink(statement)) link(parent, id);
      }
    }
    if (parents.has(id)) {
      for (const statement of entity.claims?.[PARENT_TO_CHILD] ?? []) {
        const child = itemValue(statement);
        if (child && isCurrentLink(statement)) link(id, child);
      }
    }
  }
  return [...links.values()]
    .filter(({ childId }) => {
      const child = entities[childId];
      return child !== undefined && child.missing === undefined && !isLapsed(child);
    })
    .sort(
      (a, b) =>
        qNumber(a.parentId) - qNumber(b.parentId) || qNumber(a.childId) - qNumber(b.childId),
    )
    .map(({ parentId, childId }) => {
      const child = entities[childId]!;
      return {
        parentId,
        wikidataId: childId,
        name: child.labels?.en?.value?.trim() || childId,
        websites: websites(child),
      };
    });
}

/** P355 children named by the parents in `json` (to be fetched before `ownedFromEntities`). */
export function subsidiaryIds(parentIds: readonly string[], json: EntitiesJson): string[] {
  const ids = new Set<string>();
  for (const id of parentIds) {
    for (const statement of json.entities?.[id]?.claims?.[PARENT_TO_CHILD] ?? []) {
      const child = itemValue(statement);
      if (child && isCurrentLink(statement)) ids.add(child);
    }
  }
  return [...ids];
}

/**
 * Wikidata Action API access, injected so the live adapter can cache and pace requests. Resolves to
 * null when a response is unavailable (cache-only builds); that part of the graph is then skipped.
 */
export type ApiGet = (params: Record<string, string>) => Promise<unknown>;

/** Search hits per CirrusSearch page (the API maximum) and its deepest offset. */
const SEARCH_PAGE = 500;
const SEARCH_MAX_OFFSET = 10_000;

/**
 * One level of the ownership graph below `parentIds`, through the Action API: search for children,
 * fetch parents (for P355) and children, then keep the current links.
 */
export async function queryOwnedViaApi(
  parentIds: readonly string[],
  get: ApiGet,
): Promise<OwnedEntity[]> {
  const childIds = new Set<string>();
  for (const srsearch of ownershipSearches(parentIds, 20)) {
    for (let offset = 0; offset < SEARCH_MAX_OFFSET; offset += SEARCH_PAGE) {
      const res = (await get({
        action: 'query',
        list: 'search',
        srsearch,
        srnamespace: '0',
        srlimit: String(SEARCH_PAGE),
        sroffset: String(offset),
        srprop: '',
      })) as { query?: { search?: { title?: string }[] }; continue?: unknown } | null;
      if (!res) break;
      for (const hit of res.query?.search ?? []) if (hit.title) childIds.add(hit.title);
      if (!res.continue) break;
    }
  }
  const parents = await getEntities(parentIds, get);
  subsidiaryIds(parentIds, parents).forEach((id) => childIds.add(id));
  const children = await getEntities([...childIds], get);
  return ownedFromEntities(parentIds, {
    entities: { ...children.entities, ...parents.entities },
  });
}

/** `wbgetentities` in batches of 50 (the API limit), English labels and claims only. */
async function getEntities(ids: readonly string[], get: ApiGet): Promise<EntitiesJson> {
  const entities: Record<string, Entity> = {};
  const sorted = [...ids].sort((a, b) => qNumber(a) - qNumber(b));
  for (let i = 0; i < sorted.length; i += 50) {
    const res = (await get({
      action: 'wbgetentities',
      ids: sorted.slice(i, i + 50).join('|'),
      props: 'labels|claims',
      languages: 'en',
    })) as EntitiesJson | null;
    Object.assign(entities, res?.entities ?? {});
  }
  return { entities };
}
