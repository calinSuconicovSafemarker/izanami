// Pure rule functions (ADR-0003). No network, DOM or clock access: ages are
// measured from `variant.checkedAt`.
import type {
  Fact,
  LookupFact,
  OfficialFacts,
  Rule,
  RuleId,
  RuleResult,
  VariantFacts,
} from './types';
import { isNotRegistered as notRegistered } from './types';
import { getDomain } from 'tldts';
import { ABUSE_HEAVY_TLDS, AGES, BRAND_REGISTRARS, COMMON_GTLDS, WEIGHTS } from './weights';

const DAY_MS = 86_400_000;

const result = (
  id: RuleId,
  status: RuleResult['status'],
  weight: number,
  explanation: string,
): RuleResult => ({ id, status, weight, explanation });

const value = <T>(f: Fact<T>): T | undefined => (f.state === 'known' ? f.value : undefined);

const daysBetween = (from: string, to: string) =>
  Math.floor((Date.parse(to) - Date.parse(from)) / DAY_MS);

const year = (iso: string) => iso.slice(0, 4);

const ago = (days: number) => (days === 1 ? '1 day ago' : `${days} days ago`);

const isNotRegistered = (v: VariantFacts) => notRegistered(v.existence);

function officialRegistered(o: OfficialFacts): string {
  const date = value(o.registrationDate);
  return date ? `${o.domain} was registered in ${year(date)}` : `${o.domain}'s date is unknown`;
}

const youngDomain: Rule = (v, o) => {
  const w = WEIGHTS.youngDomain;
  const id = 'young-domain';
  if (isNotRegistered(v)) return result(id, 'not-fired', w, `${v.domain} is not registered.`);
  const date = value(v.registrationDate);
  if (!date) return result(id, 'unknown', w, `Registration date of ${v.domain} is unavailable.`);
  const days = daysBetween(date, v.checkedAt);
  return days < AGES.youngDomainDays
    ? result(id, 'fired', w, `Registered ${ago(days)}; ${officialRegistered(o)}.`)
    : result(
        id,
        'not-fired',
        w,
        `Registered in ${year(date)}, more than ${AGES.youngDomainDays} days ago.`,
      );
};

const muchNewer: Rule = (v, o) => {
  const w = WEIGHTS.muchNewer;
  const id = 'much-newer';
  if (isNotRegistered(v)) return result(id, 'not-fired', w, `${v.domain} is not registered.`);
  const date = value(v.registrationDate);
  const officialDate = value(o.registrationDate);
  if (!date || !officialDate) {
    return result(id, 'unknown', w, `Cannot compare registration dates: ${missingDates(v, o)}.`);
  }
  if (daysBetween(date, v.checkedAt) < AGES.youngDomainDays) {
    return result(id, 'not-fired', w, 'Covered by young-domain (registered very recently).');
  }
  const years = Math.floor(daysBetween(officialDate, date) / 365.25);
  const both = `${v.domain} was registered in ${year(date)}, ${o.domain} in ${year(officialDate)}`;
  return years > AGES.muchNewerYears
    ? result(id, 'fired', w, `${both}: ${years} years later.`)
    : result(id, 'not-fired', w, `${both}: within ${AGES.muchNewerYears} years.`);
};

function missingDates(v: VariantFacts, o: OfficialFacts): string {
  const missing = [v, o].filter((f) => !value(f.registrationDate)).map((f) => f.domain);
  return `registration date of ${missing.join(' and ')} unavailable`;
}

const brandLookalike: Rule = (v) => {
  const id = 'brand-lookalike';
  const s = v.similarity;
  const brand = v.brandLabel;
  if (s.kind === 'homoglyph') {
    return result(
      id,
      'fired',
      WEIGHTS.brandHomoglyph,
      `${v.unicode} uses look-alike characters to imitate "${brand}" (punycode ${v.domain}).`,
    );
  }
  const w = WEIGHTS.brandLookalike;
  switch (s.kind) {
    case 'typo':
      return result(
        id,
        'fired',
        w,
        `${v.unicode} is ${s.editDistance} character edit(s) away from "${brand}".`,
      );
    case 'combo':
      return result(id, 'fired', w, `${v.unicode} contains the brand label "${brand}".`);
    case 'tld-swap':
      return result(id, 'fired', w, `${v.unicode} uses the brand label "${brand}" on another TLD.`);
    case 'subdomain-trick':
      return result(
        id,
        'fired',
        w,
        `The brand "${brand}" appears only in a subdomain; the real domain is ${v.unicode}.`,
      );
    case 'official':
      return result(id, 'not-fired', w, `${v.unicode} is an official domain.`);
    case 'unrelated':
      // SPEC: an unrelated variant is scored without the brand-lookalike rule.
      return result(id, 'not-applicable', w, `${v.unicode} is not a lookalike of ${v.orgName}.`);
  }
};

const notInTranco: Rule = (v) =>
  v.inTranco
    ? result(
        'not-in-tranco',
        'not-fired',
        WEIGHTS.notInTranco,
        `${v.domain} is in the Tranco top 100k (heavily used).`,
      )
    : result(
        'not-in-tranco',
        'fired',
        WEIGHTS.notInTranco,
        `${v.domain} is not in the Tranco top 100k of popular domains.`,
      );

const ccTld = (country: string) => {
  const cc = country.toLowerCase();
  return cc === 'gb' ? 'uk' : cc;
};

const oddTld: Rule = (v) => {
  const w = WEIGHTS.oddTld;
  const tld = v.tld.toLowerCase();
  const usual = new Set<string>([ccTld(v.orgCountry), ...COMMON_GTLDS]);
  if (usual.has(tld)) {
    return result('odd-tld', 'not-fired', w, `.${tld} is a usual TLD for ${v.orgName}.`);
  }
  return (ABUSE_HEAVY_TLDS as readonly string[]).includes(tld)
    ? result('odd-tld', 'fired', w, `.${tld} is a TLD frequently used for abuse.`)
    : result('odd-tld', 'not-fired', w, `.${tld} is not on the abuse-heavy TLD list.`);
};

const officialMatch: Rule = (v) =>
  v.similarity.isOfficial
    ? result(
        'official-match',
        'fired',
        0,
        `${v.unicode} is a known official domain of ${v.orgName}.`,
      )
    : result(
        'official-match',
        'not-fired',
        0,
        `${v.unicode} is not one of ${v.orgName}'s known official domains.`,
      );

// --- Infrastructure overlap -------------------------------------------------

/** Registrable domain of a host, e.g. `ns1.surfnet.nl` → `surfnet.nl`. */
const provider = (host: string) => getDomain(host) ?? host;

type Overlap =
  | { state: 'unknown'; why: string }
  | { state: 'none'; variant: string[]; official: string[] }
  | { state: 'shared'; shared: string[] };

function hostOverlap(label: string, v: Fact<string[]>, o: Fact<string[]>): Overlap {
  const vs = value(v);
  const os = value(o);
  if (!vs || !os) return { state: 'unknown', why: `${label} lookup unavailable` };
  if (vs.length === 0) return { state: 'none', variant: [], official: os };
  const sameHost = vs.filter((h) => os.includes(h));
  if (sameHost.length) return { state: 'shared', shared: sameHost };
  const officialProviders = new Set(os.map(provider));
  const sameProvider = [...new Set(vs.map(provider))].filter((p) => officialProviders.has(p));
  if (sameProvider.length) return { state: 'shared', shared: sameProvider };
  return { state: 'none', variant: vs, official: os };
}

const list = (xs: readonly (string | number)[]) => (xs.length ? xs.join(', ') : 'none');

const nameserverOverlap = (v: VariantFacts, o: OfficialFacts) =>
  hostOverlap('nameserver', v.nameservers, o.nameservers);
const mxOverlap = (v: VariantFacts, o: OfficialFacts) => hostOverlap('MX', v.mx, o.mx);

function asnOverlap(v: VariantFacts, o: OfficialFacts): Overlap {
  const vs = value(v.asns);
  const os = value(o.asns);
  if (!vs || !os) return { state: 'unknown', why: 'ASN lookup unavailable' };
  const shared = vs.filter((a) => os.includes(a)).map((a) => `AS${a}`);
  return shared.length
    ? { state: 'shared', shared }
    : { state: 'none', variant: vs.map((a) => `AS${a}`), official: os.map((a) => `AS${a}`) };
}

const LEGAL_SUFFIX = /\s+(inc|llc|ltd|limited|bv|nv|gmbh|ag|sa|sas|srl|corp|corporation|co)$/;

function normaliseRegistrar(name: string): string {
  let n = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  while (LEGAL_SUFFIX.test(n)) n = n.replace(LEGAL_SUFFIX, '');
  return n;
}

/** Normalised names a registrar goes by: its legal name and any `d/b/a` trade name. */
const registrarNames = (name: string) =>
  name
    .split(/\s+d\/b\/a\s+/i)
    .map(normaliseRegistrar)
    .filter(Boolean);

const isBrandRegistrar = (name: string) => {
  const n = name.toLowerCase();
  return BRAND_REGISTRARS.some((b) => n.includes(b));
};

function registrarOverlap(v: VariantFacts, o: OfficialFacts): Overlap {
  if (isNotRegistered(v)) return { state: 'none', variant: [], official: [] };
  const vr = value(v.registrar);
  const or = value(o.registrar);
  if (!vr || !or) return { state: 'unknown', why: 'registrar unavailable' };
  const officialNames = registrarNames(or);
  return registrarNames(vr).some((n) => officialNames.includes(n))
    ? { state: 'shared', shared: [or] }
    : { state: 'none', variant: [vr], official: [or] };
}

function overlapRule(
  id: RuleId,
  weight: number,
  what: string,
  overlap: Overlap,
  v: VariantFacts,
  o: OfficialFacts,
): RuleResult {
  switch (overlap.state) {
    case 'unknown':
      return result(id, 'unknown', weight, `Cannot compare ${what}: ${overlap.why}.`);
    case 'shared':
      return result(
        id,
        'fired',
        weight,
        `${v.domain} shares ${what} with ${o.domain}: ${list(overlap.shared)}.`,
      );
    case 'none':
      return result(
        id,
        'not-fired',
        weight,
        `No shared ${what}: ${v.domain} uses ${list(overlap.variant)}; ${o.domain} uses ${list(overlap.official)}.`,
      );
  }
}

const sameNameservers: Rule = (v, o) =>
  overlapRule(
    'same-nameservers',
    WEIGHTS.sameNameservers,
    'nameservers',
    nameserverOverlap(v, o),
    v,
    o,
  );

const sameMx: Rule = (v, o) =>
  overlapRule('same-mx', WEIGHTS.sameMx, 'mail (MX) provider', mxOverlap(v, o), v, o);

const sameAsn: Rule = (v, o) =>
  overlapRule('same-asn', WEIGHTS.sameAsn, 'hosting network (ASN)', asnOverlap(v, o), v, o);

const sameRegistrar: Rule = (v, o) => {
  const overlap = registrarOverlap(v, o);
  const brand = overlap.state === 'shared' && isBrandRegistrar(overlap.shared[0] ?? '');
  const r = overlapRule(
    'same-registrar',
    brand ? WEIGHTS.sameBrandRegistrar : WEIGHTS.sameRegistrar,
    'registrar',
    overlap,
    v,
    o,
  );
  if (isNotRegistered(v)) return { ...r, explanation: `${v.domain} is not registered.` };
  return brand
    ? { ...r, explanation: `${r.explanation} It is a corporate brand-protection registrar.` }
    : r;
};

// --- Existence and mail -----------------------------------------------------

function existenceUnknown(id: RuleId, w: number, v: VariantFacts): RuleResult | undefined {
  const e = value(v.existence);
  if (!e) return result(id, 'unknown', w, `Could not determine whether ${v.domain} is live.`);
  if (e !== 'resolving') {
    const state = e === 'not-registered' ? 'is not registered' : 'does not resolve';
    return result(id, 'not-fired', w, `${v.domain} ${state}.`);
  }
  return undefined;
}

/**
 * A parked defensive registration (sharing nameservers or registrar with the official domain)
 * is expected to have no mail, so `no-mx` does not fire for it (ADR-0003 amendment).
 */
const noMx: Rule = (v, o) => {
  const id = 'no-mx';
  const w = WEIGHTS.noMx;
  const early = existenceUnknown(id, w, v);
  if (early) return early;
  const mx = value(v.mx);
  const spf = value(v.spf);
  if (mx?.length) return result(id, 'not-fired', w, `${v.domain} has MX: ${list(mx)}.`);
  if (spf === true) return result(id, 'not-fired', w, `${v.domain} publishes an SPF record.`);
  if (nameserverOverlap(v, o).state === 'shared') {
    const why = `shares nameservers with ${o.domain}`;
    return result(
      id,
      'not-fired',
      w,
      `${v.domain} ${why}: no mail is expected on a parked domain.`,
    );
  }
  if (registrarOverlap(v, o).state === 'shared') {
    const why = `shares the registrar of ${o.domain}`;
    return result(
      id,
      'not-fired',
      w,
      `${v.domain} ${why}: no mail is expected on a parked domain.`,
    );
  }
  if (!mx || spf === undefined) {
    return result(id, 'unknown', w, `MX or SPF lookup for ${v.domain} unavailable.`);
  }
  return result(id, 'fired', w, `${v.domain} resolves but has no MX and no SPF record.`);
};

const mailReady: Rule = (v, o) => {
  const id = 'mail-ready';
  const w = WEIGHTS.mailReady;
  const early = existenceUnknown(id, w, v);
  if (early) return early;
  const mx = value(v.mx);
  const spf = value(v.spf);
  if (mx?.length === 0) return result(id, 'not-fired', w, `${v.domain} has no MX records.`);
  if (spf === false) return result(id, 'not-fired', w, `${v.domain} has no SPF record.`);
  if (!mx || spf === undefined) {
    return result(id, 'unknown', w, `MX or SPF lookup for ${v.domain} unavailable.`);
  }
  const overlaps = [
    nameserverOverlap(v, o),
    registrarOverlap(v, o),
    mxOverlap(v, o),
    asnOverlap(v, o),
  ];
  if (overlaps.some((x) => x.state === 'shared')) {
    return result(
      id,
      'not-fired',
      w,
      `${v.domain} can send mail but shares infrastructure with ${o.domain}.`,
    );
  }
  if (overlaps.some((x) => x.state === 'unknown')) {
    return result(
      id,
      'unknown',
      w,
      `${v.domain} can send mail; infrastructure overlap with ${o.domain} partly unknown.`,
    );
  }
  return result(
    id,
    'fired',
    w,
    `${v.domain} is set up for mail (MX ${list(mx)}, SPF) with no infrastructure shared with ${o.domain}.`,
  );
};

const freshCert: Rule = (v) => {
  const id = 'fresh-cert';
  const w = WEIGHTS.freshCert;
  const f = v.firstCertDate;
  if (f.state !== 'known') {
    return result(id, 'unknown', w, 'Certificate Transparency history (crt.sh) unavailable.');
  }
  if (f.value === null) {
    return result(id, 'not-fired', w, `No certificate has ever been logged for ${v.domain}.`);
  }
  const days = daysBetween(f.value, v.checkedAt);
  return days < AGES.freshCertDays
    ? result(id, 'fired', w, `First TLS certificate for ${v.domain} was issued ${ago(days)}.`)
    : result(
        id,
        'not-fired',
        w,
        `First TLS certificate for ${v.domain} dates from ${year(f.value)}.`,
      );
};

const registeredNotResolving: Rule = (v) => {
  const id = 'registered-not-resolving';
  const w = WEIGHTS.registeredNotResolving;
  switch (value(v.existence)) {
    case 'registered-not-resolving':
      return result(id, 'fired', w, `${v.domain} is registered but not live yet — worth watching.`);
    case 'resolving':
      return result(id, 'not-fired', w, `${v.domain} resolves in DNS.`);
    case 'not-registered':
      return result(id, 'not-fired', w, `${v.domain} is not registered.`);
    case undefined:
      return result(id, 'unknown', w, `Could not determine whether ${v.domain} is registered.`);
  }
};

/** Every rule, in display order. */
export const RULES: Record<RuleId, Rule> = {
  'official-match': officialMatch,
  'young-domain': youngDomain,
  'much-newer': muchNewer,
  'brand-lookalike': brandLookalike,
  'not-in-tranco': notInTranco,
  'same-nameservers': sameNameservers,
  'same-registrar': sameRegistrar,
  'same-mx': sameMx,
  'same-asn': sameAsn,
  'no-mx': noMx,
  'mail-ready': mailReady,
  'fresh-cert': freshCert,
  'registered-not-resolving': registeredNotResolving,
  'odd-tld': oddTld,
};

/**
 * Looked-up facts each rule reads (on the variant and/or the official side), so callers can tell
 * a rule that is still waiting for a lookup from one whose lookup failed.
 */
export const RULE_INPUTS: Record<RuleId, readonly LookupFact[]> = {
  'official-match': [],
  'young-domain': ['existence', 'registrationDate'],
  'much-newer': ['existence', 'registrationDate'],
  'brand-lookalike': [],
  'not-in-tranco': [],
  'same-nameservers': ['nameservers'],
  'same-registrar': ['existence', 'registrar'],
  'same-mx': ['mx'],
  'same-asn': ['asns'],
  'no-mx': ['existence', 'mx', 'spf', 'nameservers', 'registrar'],
  'mail-ready': ['existence', 'mx', 'spf', 'nameservers', 'registrar', 'asns'],
  'fresh-cert': ['firstCertDate'],
  'registered-not-resolving': ['existence'],
  'odd-tld': [],
};
