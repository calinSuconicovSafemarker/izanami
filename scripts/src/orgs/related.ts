import { parse } from 'tldts';
import { registrableDomain } from '../lib/domain';
import type { RelatedDomain, RelatedSource } from '../lib/web';
import { officialDomainOf } from './domains';
import type { Org } from './select';

/**
 * Related official domains (ticket 15, ADR-0002 Amendment 2): domains an organisation's products,
 * subsidiaries and systems use, from three passive sources. Each domain ends up under one
 * organisation only.
 */

/** An entity linked to `parentId` by owned by (P127), parent organization (P749) or subsidiary (P355). */
export interface OwnedEntity {
  parentId: string;
  wikidataId: string;
  name: string;
  /** Non-deprecated P856 values (may be empty: the entity still links deeper levels). */
  websites: string[];
  /** Set for a hand-curated link (`owns` in extras.json): the URL backing it. */
  source?: string;
}

/** A list of `domains` the company publishes itself (already parsed). */
export interface PublishedDomains {
  wikidataId: string;
  name: string;
  /** Evidence link shown next to each domain. */
  url: string;
  domains: readonly string[];
}

/** A hand-curated related domain from `scripts/data/extras.json`. */
export interface CuratedDomain {
  wikidataId: string;
  domain: string;
  /** URL backing the claim. */
  url: string;
}

export interface RelatedInputs {
  owned?: readonly OwnedEntity[];
  published?: readonly PublishedDomains[];
  curated?: readonly CuratedDomain[];
}

/** A curated or published domain that was left out, and why. */
export interface SkippedDomain {
  orgId: string;
  domain: string;
  source: RelatedSource;
  reason: string;
}

/**
 * Whether subdomains of `domain` are separate sites run by anyone (appspot.com, googleapis.com,
 * azureedge.net): the Public Suffix List's private section lists the domain itself as a suffix.
 * Such a domain must never make a lookalike "Official". Deeper suffixes (blob.core.windows.net)
 * are not detected; published lists exclude those by hand (`excludeDomains`).
 */
export function isSharedHosting(domain: string): boolean {
  return parse(`x.${domain}`, { allowPrivateDomains: true }).isPrivate === true;
}

/** How many ownership hops below an organisation are followed. */
export const OWNERSHIP_DEPTH = 2;

const SOURCE_PRECEDENCE: Record<RelatedSource, number> = {
  curated: 0,
  'published-list': 1,
  'wikidata-owned': 2,
};

interface Candidate extends RelatedDomain {
  orgId: string;
  depth: number;
}

/**
 * Sets `relatedDomains` on every org. Rules:
 * - Wikidata: P856 of entities owned one or two levels below the org; the P856 must be a site
 *   root (as for official domains) and the domain must have a Tranco rank (ADR-0002: Wikidata alone
 *   is not enough).
 * - Published lists and curated entries are taken as they are.
 * - A domain that is another org's official domain is kept only when that org is itself owned by
 *   this one (YouTube under Google); otherwise it is skipped.
 * - A domain goes to one org only: curated beats published beats Wikidata, then the nearer owner,
 *   then the better-ranked org.
 */
export function addRelatedDomains(
  orgs: readonly Org[],
  tranco: ReadonlyMap<string, number>,
  inputs: RelatedInputs,
): { orgs: Org[]; skipped: SkippedDomain[] } {
  const orgIndex = new Map(orgs.map((o, i) => [o.wikidataId, i]));
  const officialOwner = new Map<string, Org>();
  for (const org of orgs) org.officialDomains.forEach((d) => officialOwner.set(d, org));

  const { candidates: ownedCandidates, descendants } = ownershipCandidates(
    orgs,
    inputs.owned ?? [],
    tranco,
  );
  const candidates: Candidate[] = [
    ...(inputs.curated ?? []).map((c) => ({
      orgId: c.wikidataId,
      domain: c.domain,
      source: 'curated' as const,
      url: c.url,
      depth: 0,
    })),
    ...(inputs.published ?? []).flatMap((list) =>
      list.domains.map((domain) => ({
        orgId: list.wikidataId,
        domain,
        source: 'published-list' as const,
        via: list.name,
        url: list.url,
        depth: 0,
      })),
    ),
    ...ownedCandidates,
  ]
    .filter((c) => orgIndex.has(c.orgId))
    .sort(
      (a, b) =>
        SOURCE_PRECEDENCE[a.source] - SOURCE_PRECEDENCE[b.source] ||
        a.depth - b.depth ||
        orgIndex.get(a.orgId)! - orgIndex.get(b.orgId)! ||
        a.domain.localeCompare(b.domain),
    );

  const assigned = new Map<string, Candidate>();
  const skipped: SkippedDomain[] = [];
  for (const candidate of candidates) {
    const { orgId, domain, source } = candidate;
    const owner = officialOwner.get(domain);
    if (owner?.wikidataId === orgId || assigned.has(domain)) continue;
    // Curated entries are a human decision (withgoogle.com is on the PSL but only Google uses it).
    if (source !== 'curated' && isSharedHosting(domain)) {
      if (source === 'published-list') {
        skipped.push({
          orgId,
          domain,
          source,
          reason: 'shared hosting (Public Suffix List private section)',
        });
      }
      continue;
    }
    if (owner && !descendants.get(orgId)?.has(owner.wikidataId)) {
      if (source !== 'wikidata-owned') {
        skipped.push({
          orgId,
          domain,
          source,
          reason: `official domain of ${owner.name} (${owner.wikidataId})`,
        });
      }
      continue;
    }
    // Another org's own site is allowed only because this org owns that org: credit the ownership
    // link (Wikidata or curated), whichever source named the domain.
    const curatedLink = owner && descendants.get(orgId)?.get(owner.wikidataId);
    assigned.set(
      domain,
      !owner
        ? candidate
        : curatedLink
          ? { ...candidate, source: 'curated', via: owner.name, url: curatedLink }
          : {
              ...candidate,
              source: 'wikidata-owned',
              via: owner.name,
              url: `https://www.wikidata.org/wiki/${owner.wikidataId}`,
            },
    );
  }

  const byOrg = new Map<string, RelatedDomain[]>();
  for (const { orgId, domain, source, via, url } of assigned.values()) {
    const entry: RelatedDomain = { domain, source };
    if (via) entry.via = via;
    if (url) entry.url = url;
    byOrg.set(orgId, [...(byOrg.get(orgId) ?? []), entry]);
  }
  return {
    orgs: orgs.map((org) => ({
      ...org,
      relatedDomains: (byOrg.get(org.wikidataId) ?? []).sort((a, b) =>
        a.domain.localeCompare(b.domain),
      ),
    })),
    skipped,
  };
}

/** Walks the ownership graph below each org; returns candidate domains and all reached entities. */
function ownershipCandidates(
  orgs: readonly Org[],
  owned: readonly OwnedEntity[],
  tranco: ReadonlyMap<string, number>,
): {
  candidates: Candidate[];
  /** org → every entity reached below it → the curated link's source URL, if curated. */
  descendants: Map<string, Map<string, string | undefined>>;
} {
  const children = new Map<string, OwnedEntity[]>();
  for (const entity of owned) {
    children.set(entity.parentId, [...(children.get(entity.parentId) ?? []), entity]);
  }
  const candidates: Candidate[] = [];
  const descendants = new Map<string, Map<string, string | undefined>>();
  for (const org of orgs) {
    const seen = new Map<string, string | undefined>([[org.wikidataId, undefined]]);
    let frontier = [org.wikidataId];
    for (let depth = 1; depth <= OWNERSHIP_DEPTH; depth++) {
      const next: string[] = [];
      for (const parent of frontier) {
        for (const entity of children.get(parent) ?? []) {
          if (seen.has(entity.wikidataId)) continue;
          seen.set(entity.wikidataId, entity.source);
          next.push(entity.wikidataId);
          const domains = new Set(entity.websites.map(officialDomainOf));
          for (const domain of domains) {
            if (!domain || !tranco.has(domain)) continue;
            candidates.push({
              orgId: org.wikidataId,
              domain,
              source: 'wikidata-owned',
              via: entity.name,
              url: `https://www.wikidata.org/wiki/${entity.wikidataId}`,
              depth,
            });
          }
        }
      }
      frontier = next;
    }
    seen.delete(org.wikidataId);
    descendants.set(org.wikidataId, seen);
  }
  return { candidates, descendants };
}

export const PUBLISHED_LIST_PARSERS = ['domain-lines', 'microsoft-365-endpoints'] as const;

/** One entry of `scripts/data/published-lists.json`. */
export interface PublishedListConfig {
  /** The organisation the list belongs to. */
  wikidataId: string;
  name: string;
  /** Machine-readable list fetched at build time (cached). */
  url: string;
  /** Human-readable page describing the list and its intended use; shown as evidence. */
  docs?: string;
  parser: (typeof PUBLISHED_LIST_PARSERS)[number];
  /**
   * Domains the list mentions that must not count as official: third parties (CDNs) and domains
   * where customers get their own subdomains (sharepoint.com tenants, blob.core.windows.net).
   */
  excludeDomains?: string[];
  /** Microsoft 365: endpoint sets to ignore (125 = third-party certificate revocation). */
  excludeEndpointIds?: number[];
}

/** Validates the parsed `published-lists.json` content. */
export function parsePublishedListsConfig(json: unknown): PublishedListConfig[] {
  if (!Array.isArray(json)) throw new Error('published-lists.json must be an array');
  return json.map((raw: Partial<PublishedListConfig>, i) => {
    const where = `published-lists.json[${i}]`;
    if (!raw.wikidataId || !/^Q\d+$/.test(raw.wikidataId))
      throw new Error(`${where}: wikidataId must be a Q-id`);
    if (!raw.name) throw new Error(`${where}: name is required`);
    if (!raw.url || !/^https:\/\/\S+$/.test(raw.url))
      throw new Error(`${where}: url must be an https URL`);
    if (raw.docs !== undefined && !/^https:\/\/\S+$/.test(raw.docs))
      throw new Error(`${where}: docs must be an https URL`);
    if (!raw.parser || !(PUBLISHED_LIST_PARSERS as readonly string[]).includes(raw.parser))
      throw new Error(`${where}: parser must be one of ${PUBLISHED_LIST_PARSERS.join(', ')}`);
    return raw as PublishedListConfig;
  });
}

/** Registrable domains named by a downloaded list, sorted and de-duplicated. */
export function parsePublishedList(config: PublishedListConfig, body: string): string[] {
  const hosts =
    config.parser === 'domain-lines'
      ? body.split(/\r?\n/)
      : microsoftEndpointUrls(body, new Set(config.excludeEndpointIds ?? []));
  const excluded = new Set(config.excludeDomains ?? []);
  const domains = new Set<string>();
  for (const host of hosts) {
    const name = host
      .trim()
      .replace(/^(\*?\.)+/, '')
      .replace(/\*/g, 'x');
    const domain = name && registrableDomain(name);
    if (domain && !excluded.has(domain)) domains.add(domain);
  }
  return [...domains].sort();
}

function microsoftEndpointUrls(body: string, excludeIds: ReadonlySet<number>): string[] {
  const sets = JSON.parse(body) as { id?: number; urls?: string[] }[];
  if (!Array.isArray(sets)) throw new Error('Microsoft 365 endpoints: expected an array');
  return sets.filter((s) => !excludeIds.has(s.id ?? -1)).flatMap((s) => s.urls ?? []);
}
