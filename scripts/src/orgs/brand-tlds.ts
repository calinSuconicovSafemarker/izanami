import type { Org } from './select';

/**
 * Brand TLDs (ticket 14): top-level domains an organisation runs for itself (`.google`, `.gle`),
 * so every domain under them is the organisation's. Sources:
 * - IANA Root Zone Database (https://www.iana.org/domains/root/db): each TLD's manager.
 * - ICANN gTLD list (https://www.icann.org/resources/registries/gtlds/v2/gtlds.json): which TLDs
 *   are `.brand` TLDs (Specification 13: only the operator and its affiliates may register).
 * - `scripts/data/brand-tlds.json`: curated registry operator → org mapping with a source URL,
 *   plus closed TLDs without Specification 13 that only the organisation uses (`.gle`).
 * Open TLDs a brand's registry also runs (`.app`, `.dev`) are never included.
 */

/** One delegated TLD from the IANA Root Zone Database. */
export interface RootZoneEntry {
  /** Punycode, no dot. */
  tld: string;
  /** "Generic", "Country Code", "Sponsored", … */
  type: string;
  /** TLD manager (registry operator) as IANA lists it. */
  manager: string;
}

export interface ClosedTld {
  tld: string;
  /** URL backing that only the organisation uses the TLD. */
  source: string;
}

/** One entry of `scripts/data/brand-tlds.json`. */
export interface BrandTldOperator {
  /** Exactly as the IANA Root Zone Database names the TLD manager. */
  operator: string;
  /** The organisation that runs (or owns) the operator. */
  wikidataId: string;
  /** URL backing the operator → organisation link. */
  source: string;
  /** Closed TLDs without Specification 13 that count anyway. */
  closedTlds?: ClosedTld[];
}

export interface BrandTldInputs {
  rootZone: readonly RootZoneEntry[];
  /** TLDs with Specification 13 in a live registry agreement. */
  specification13: ReadonlySet<string>;
  operators: readonly BrandTldOperator[];
}

const strip = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Delegated (status "Active") TLDs from the Root Zone Database index page. */
export function parseRootZoneDb(html: string): RootZoneEntry[] {
  const entries: RootZoneEntry[] = [];
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const tld = /href="\/domains\/root\/db\/([^".]+)(?:\.html)?"/.exec(row)?.[1];
    if (!tld) continue;
    const cells = row
      .split(/<td[^>]*>/)
      .slice(1)
      .map(strip);
    const [, status, type, manager] = cells;
    if (status !== 'Active' || !type || !manager) continue;
    entries.push({ tld: tld.toLowerCase(), type, manager });
  }
  return entries;
}

interface IcannGtld {
  gTLD?: string;
  specification13?: boolean | null;
  contractTerminated?: boolean | null;
  removalDate?: string | null;
}

/** `.brand` TLDs (Specification 13) whose registry agreement is still in force. */
export function parseSpecification13(json: unknown): Set<string> {
  const list = (json as { gTLDs?: IcannGtld[] } | null)?.gTLDs;
  if (!Array.isArray(list)) throw new Error('ICANN gTLD list: expected { gTLDs: [...] }');
  return new Set(
    list
      .filter(
        (t) => t.gTLD && t.specification13 === true && !t.contractTerminated && !t.removalDate,
      )
      .map((t) => t.gTLD!.toLowerCase()),
  );
}

const HTTPS = /^https:\/\/\S+$/;

/** Validates the parsed `brand-tlds.json` content. */
export function parseBrandTldsConfig(json: unknown): BrandTldOperator[] {
  if (!Array.isArray(json)) throw new Error('brand-tlds.json must be an array');
  return json.map((raw: Partial<BrandTldOperator>, i) => {
    const where = `brand-tlds.json[${i}]`;
    if (!raw.operator) throw new Error(`${where}: operator is required`);
    if (!raw.wikidataId || !/^Q\d+$/.test(raw.wikidataId))
      throw new Error(`${where}: wikidataId must be a Q-id`);
    if (!raw.source || !HTTPS.test(raw.source))
      throw new Error(`${where}: source must be an https URL`);
    raw.closedTlds?.forEach((c: Partial<ClosedTld>, j) => {
      if (!c.tld || !/^[a-z0-9-]+$/.test(c.tld))
        throw new Error(`${where}.closedTlds[${j}]: tld must be a lower-case punycode label`);
      if (!c.source || !HTTPS.test(c.source))
        throw new Error(`${where}.closedTlds[${j}]: source must be an https URL`);
    });
    return raw as BrandTldOperator;
  });
}

/**
 * Sets `brandTlds` on every org: generic TLDs whose IANA manager maps to the org and that are
 * `.brand` TLDs or curated closed TLDs. Curated closed TLDs IANA lists under another manager are
 * skipped and noted.
 */
export function assignBrandTlds(
  orgs: readonly Org[],
  { rootZone, specification13, operators }: BrandTldInputs,
): { orgs: Org[]; notes: string[] } {
  const managerOf = new Map(
    rootZone.filter((e) => e.type === 'Generic').map((e) => [e.tld, e.manager]),
  );
  const byOrg = new Map<string, Set<string>>();
  const notes: string[] = [];
  const add = (wikidataId: string, tld: string) =>
    byOrg.set(wikidataId, (byOrg.get(wikidataId) ?? new Set()).add(tld));

  for (const op of operators) {
    if (![...managerOf.values()].includes(op.operator)) {
      notes.push(
        `Brand-TLD operator "${op.operator}" manages no generic TLD in the IANA Root Zone Database.`,
      );
    }
    for (const [tld, manager] of managerOf) {
      if (manager === op.operator && specification13.has(tld)) add(op.wikidataId, tld);
    }
    for (const { tld } of op.closedTlds ?? []) {
      const manager = managerOf.get(tld);
      if (manager === op.operator) add(op.wikidataId, tld);
      else
        notes.push(
          `Brand TLD .${tld} is curated for ${op.operator} but ` +
            (manager
              ? `IANA lists ${manager} as its manager; skipped.`
              : 'IANA lists no such generic TLD; skipped.'),
        );
    }
  }
  return {
    orgs: orgs.map((org) => ({ ...org, brandTlds: [...(byOrg.get(org.wikidataId) ?? [])].sort() })),
    notes,
  };
}
