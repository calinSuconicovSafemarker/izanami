import { assignSlugs, compareOrgs, type Org } from './select';

/** A hand-curated entry of `scripts/data/extras.json`; exempt from the Tranco check (ADR-0002). */
export interface Extra {
  wikidataId: string;
  slug?: string;
  name: string;
  country?: string | null;
  primaryDomain: string;
  officialDomains: string[];
  /** URL backing the claim that these domains are official. Required. */
  source: string;
}

/** Validates the parsed `extras.json` content. */
export function parseExtras(json: unknown): Extra[] {
  if (!Array.isArray(json)) throw new Error('extras.json must be an array');
  return json.map((raw: Partial<Extra>, i) => {
    const where = `extras.json[${i}]`;
    if (!raw.wikidataId || !/^Q\d+$/.test(raw.wikidataId))
      throw new Error(`${where}: wikidataId must be a Q-id`);
    if (!raw.name) throw new Error(`${where}: name is required`);
    if (!raw.source || !/^https?:\/\/\S+$/.test(raw.source))
      throw new Error(`${where}: source must be an http(s) URL`);
    if (!raw.primaryDomain || !raw.officialDomains?.includes(raw.primaryDomain))
      throw new Error(`${where}: primaryDomain must be listed in officialDomains`);
    return raw as Extra;
  });
}

/**
 * Adds extras to the generated list. An extra replaces a generated org for the same entity or
 * primary domain (its name, slug and primary win; official domains are unioned).
 */
export function mergeExtras(
  generated: readonly Org[],
  extras: readonly Extra[],
  tranco: ReadonlyMap<string, number>,
  confirmedAt: string,
): Org[] {
  let orgs = generated.map((o) => ({ ...o, slug: '' }));
  const curated: Org[] = [];
  for (const extra of extras) {
    const replaced = orgs.filter(
      (o) => o.wikidataId === extra.wikidataId || o.primaryDomain === extra.primaryDomain,
    );
    orgs = orgs.filter((o) => !replaced.includes(o));
    const match = replaced.find((o) => o.wikidataId === extra.wikidataId);
    curated.push({
      slug: extra.slug ?? '',
      name: extra.name,
      wikidataId: extra.wikidataId,
      country: extra.country ?? match?.country ?? null,
      primaryDomain: extra.primaryDomain,
      officialDomains: [
        ...new Set([...extra.officialDomains, ...(match?.officialDomains ?? [])]),
      ].sort(),
      wikidataDomain: match?.wikidataDomain ?? null,
      trancoRank: tranco.get(extra.primaryDomain) ?? null,
      confirmedAt,
    });
  }
  return assignSlugs([...orgs, ...curated].sort(compareOrgs));
}
