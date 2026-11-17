// Collects facts for the rules through a LookupClient. The only module in
// rules/ that does I/O, and only via the injected client.
import { toUnicode } from 'punycode/';
import { has as inTrancoTop100k } from '../data/tranco';
import { similarity, type ParsedVariant } from '../domain';
import type { DnsResult, LookupClient, RdapResult } from '../lookup';
import type {
  Existence,
  Fact,
  Facts,
  InfraFacts,
  OfficialFacts,
  OrgInput,
  VariantFacts,
} from './types';
import { known, PENDING, UNKNOWN } from './types';

export interface GatherOptions {
  /** Clock for `checkedAt` (rules measure ages from it). Default: now. */
  now?: Date;
  /** Called with a fresh snapshot each time a lookup settles; pending facts are `{ state: 'pending' }`. */
  onProgress?: (facts: Facts) => void;
}

interface Collected extends InfraFacts {
  existence: Fact<Existence>;
  spf: Fact<boolean>;
  firstCertDate: Fact<string | null>;
}

type Emit = (partial: Partial<Collected>) => void;

const pendingInfra = (domain: string): Collected => ({
  domain,
  registrationDate: PENDING,
  registrar: PENDING,
  nameservers: PENDING,
  mx: PENDING,
  asns: PENDING,
  existence: PENDING,
  spf: PENDING,
  firstCertDate: PENDING,
});

const answered = (r: DnsResult) => r.status !== 'unavailable';

/** `10 mx.example.com` → `mx.example.com`; drops the null MX (`0 .`). */
const mxHost = (record: string) =>
  record
    .replace(/^\d+\s+/, '')
    .replace(/\.$/, '')
    .toLowerCase();

function dnsList(r: DnsResult, map: (s: string) => string = (s) => s.toLowerCase()) {
  if (r.status === 'unavailable') return UNKNOWN;
  return known(r.records.map(map).filter(Boolean));
}

function existence(dns: DnsResult[], rdap: RdapResult): Fact<Existence> {
  if (dns.some((r) => r.status === 'ok' && r.records.length > 0)) return known('resolving');
  const dnsAnswered = dns.some(answered);
  if (rdap.registered === true && dnsAnswered) return known('registered-not-resolving');
  if (rdap.status === 'not-found' && dns.every(answered)) return known('not-registered');
  return UNKNOWN;
}

function nameservers(ns: DnsResult, rdap: RdapResult): Fact<string[]> {
  if (ns.status === 'ok' && ns.records.length) return dnsList(ns);
  if (rdap.status === 'ok') return known(rdap.nameservers);
  if (ns.status === 'not-found' || rdap.status === 'not-found') return known([]);
  return ns.status === 'ok' ? known([]) : UNKNOWN;
}

/** Origin ASNs of the first IPv4 and first IPv6 address. */
async function asns(client: LookupClient, a: DnsResult, aaaa: DnsResult): Promise<Fact<number[]>> {
  const ips = [a.records[0], aaaa.records[0]].filter((ip): ip is string => !!ip);
  if (ips.length === 0) return answered(a) && answered(aaaa) ? known([]) : UNKNOWN;
  const results = await Promise.all(ips.map((ip) => client.asn(ip)));
  if (results.every((r) => r.status === 'unavailable')) return UNKNOWN;
  const found = results.flatMap((r) => (r.asn ? [r.asn] : []));
  return known([...new Set(found)]);
}

/** Look up one domain's infrastructure, emitting each fact as soon as it is known. */
async function collect(
  domain: string,
  client: LookupClient,
  emit: Emit,
  withCerts: boolean,
): Promise<Collected> {
  const out = pendingInfra(domain);
  const set = (partial: Partial<Collected>) => {
    Object.assign(out, partial);
    emit(partial);
  };
  const ns = client.dns(domain, 'NS');
  const a = client.dns(domain, 'A');
  const aaaa = client.dns(domain, 'AAAA');
  const mx = client.dns(domain, 'MX');
  const txt = client.dns(domain, 'TXT');
  const rdap = client.rdap(domain);

  const tasks: Promise<unknown>[] = [
    mx.then((r) => set({ mx: dnsList(r, mxHost) })),
    txt.then((r) =>
      set({
        spf: answered(r) ? known(r.records.some((t) => /^v=spf1\b/i.test(t))) : UNKNOWN,
      }),
    ),
    rdap.then((r) =>
      set({
        registrationDate: r.registrationDate ? known(r.registrationDate) : UNKNOWN,
        registrar: r.registrar ? known(r.registrar) : UNKNOWN,
      }),
    ),
    Promise.all([ns, rdap]).then(([n, r]) => set({ nameservers: nameservers(n, r) })),
    Promise.all([a, aaaa]).then(async ([x, y]) => set({ asns: await asns(client, x, y) })),
    Promise.all([ns, a, aaaa, mx, rdap]).then(([n, x, y, m, r]) =>
      set({ existence: existence([n, x, y, m], r) }),
    ),
  ];
  if (withCerts) {
    tasks.push(
      client.certs(domain).then((r) =>
        set({
          firstCertDate:
            r.status === 'unavailable' ? UNKNOWN : known(r.certs[0]?.notBefore ?? null),
        }),
      ),
    );
  }
  await Promise.all(tasks);
  return out;
}

const infraOnly = ({ domain, registrationDate, registrar, nameservers, mx, asns }: Collected) => ({
  domain,
  registrationDate,
  registrar,
  nameservers,
  mx,
  asns,
});

const hasUnknown = (f: OfficialFacts) =>
  [f.registrationDate, f.registrar, f.nameservers, f.mx, f.asns].some((x) => x.state !== 'known');

/** Official facts per client and domain, so each official domain is looked up once per session. */
const officialCache = new WeakMap<LookupClient, Map<string, Promise<OfficialFacts>>>();

function officialFacts(domain: string, client: LookupClient, emit: Emit): Promise<OfficialFacts> {
  let perClient = officialCache.get(client);
  if (!perClient) officialCache.set(client, (perClient = new Map()));
  const cached = perClient.get(domain);
  if (cached) return cached;
  const p = collect(domain, client, emit, false).then(infraOnly);
  perClient.set(domain, p);
  // Do not pin a failed lookup for the whole session; retry on the next variant.
  void p.then((f) => {
    if (hasUnknown(f)) perClient.delete(domain);
  });
  return p;
}

/**
 * Gather everything the rules need about a variant and the organisation's
 * primary domain. Never throws: failed lookups become `unknown` facts.
 */
export async function gatherFacts(
  variant: ParsedVariant,
  org: OrgInput,
  client: LookupClient,
  options: GatherOptions = {},
): Promise<Facts> {
  const domain = variant.registrableDomain;
  const base = {
    unicode: toUnicode(domain),
    tld: variant.tld,
    brandLabel: org.brandLabel,
    orgName: org.name,
    orgCountry: org.country,
    similarity: similarity(variant, org.brandLabel, org.officialDomains),
    inTranco: inTrancoTop100k(domain),
    checkedAt: (options.now ?? new Date()).toISOString(),
  };
  let v: VariantFacts = { ...base, ...pendingInfra(domain) };
  let o: OfficialFacts = infraOnly(pendingInfra(org.primaryDomain));
  const report = () => options.onProgress?.({ variantFacts: v, officialFacts: o });
  report();

  const [variantInfra, official] = await Promise.all([
    collect(domain, client, (p) => ((v = { ...v, ...p }), report()), true),
    officialFacts(org.primaryDomain, client, (p) => {
      o = { ...o, ...infraOnly({ ...pendingInfra(o.domain), ...o, ...p }) };
      report();
    }),
  ]);
  v = { ...base, ...variantInfra };
  o = official;
  const facts = { variantFacts: v, officialFacts: o };
  options.onProgress?.(facts);
  return facts;
}
