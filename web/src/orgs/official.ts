import { normaliseTld, parseVariant } from '../domain';
import type { RelatedOwned } from '../rules';
import type { Org, RelatedSource } from './org';

/**
 * The one definition of "official" for an organisation (R1, S2). Used by similarity, the rules
 * input, TLD rating, quick picks, the lookalike scan and export.
 *
 * Trust levels:
 * - Official: the org's own sites (P856 / curated extras), its brand TLDs, and related domains
 *   from a list the company publishes or a curated entry with a source. A variant here
 *   short-circuits to the Official verdict.
 * - Listed (verify at lookup): related domains Wikidata lists as owned. Wikidata keeps dead
 *   acquisitions and investments, so these only add the `listed-related` legit signal.
 */
export interface OfficialContext {
  primary: string;
  /** Registrable label of the primary domain (`tudelft`). */
  brandLabel: string;
  /** Official-level registrable domains, own sites first. */
  officialDomains: readonly string[];
  /** Verify-level domains Wikidata lists as owned. */
  relatedOwned: readonly RelatedOwned[];
  /** The org's brand TLDs, normalised (`normaliseTld`). */
  brandTlds: readonly string[];
}

/** Related-domain sources trusted enough to short-circuit to Official. */
export const OFFICIAL_SOURCES: readonly RelatedSource[] = ['published-list', 'curated'];

export const isOfficialSource = (source: RelatedSource) => OFFICIAL_SOURCES.includes(source);

const cache = new WeakMap<Org, OfficialContext>();

export function officialContext(org: Org): OfficialContext {
  const hit = cache.get(org);
  if (hit) return hit;
  const ctx: OfficialContext = {
    primary: org.primaryDomain,
    brandLabel: parseVariant(org.primaryDomain).label,
    officialDomains: [
      ...org.officialDomains,
      ...org.relatedDomains.filter((r) => isOfficialSource(r.source)).map((r) => r.domain),
    ],
    relatedOwned: org.relatedDomains
      .filter((r) => !isOfficialSource(r.source))
      .map((r) => (r.via ? { domain: r.domain, via: r.via } : { domain: r.domain })),
    brandTlds: org.brandTlds.map(normaliseTld),
  };
  cache.set(org, ctx);
  return ctx;
}
