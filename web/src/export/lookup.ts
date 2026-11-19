// Export of one lookup (SPEC "Export"). Pure: no DOM, no I/O.
import { techniqueLabel, type LookalikeKind, type ParsedVariant, type Similarity } from '../domain';
import { homoglyphSegments, similarityPercent } from '../domain/analysis';
import { dataVersion, officialContext, type Org } from '../orgs';
import {
  evaluate,
  FACT_SOURCES,
  isNotRegistered,
  unknownSources,
  verdict,
  whyList,
  type Existence,
  type Fact,
  type Facts,
  type InfraFacts,
  type RuleId,
  type RuleStatus,
  type VerdictLabel,
  type WhyItem,
} from '../rules';
import { rateTld, type TldRating } from '../tld/rating';
import { toCsv } from './csv';
import { EXPORT_SCHEMA_VERSION, exportOrg, type ExportOrg } from './common';

/** A lookup fact: its value, or `null` when the lookup failed or never answered. */
type Value<T> = T | null;

export interface ExportInfra {
  domain: string;
  registrationDate: Value<string>;
  registrar: Value<string>;
  nameservers: Value<string[]>;
  mx: Value<string[]>;
  addresses: Value<string[]>;
  asns: Value<number[]>;
}

/** The JSON document for one lookup; documented in docs/SPEC.md ("Export"). */
export interface LookupExport {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  tool: 'izanami';
  kind: 'lookup';
  /** ISO 8601. */
  exportedAt: string;
  /** When the facts were gathered (ISO 8601); `null` for an official domain (no lookups). */
  checkedAt: string | null;
  org: ExportOrg;
  variant: { input: string; unicode: string; punycode: string; registrableDomain: string };
  analysis: {
    technique: LookalikeKind;
    /** Human label for the technique (`TLD swap`). */
    techniqueLabel: string;
    editDistance: number;
    /** 0–100. */
    similarityPercent: number;
    homoglyphs: { text: string; looksLike: string; codePoints: string }[];
    /** `null` for an official domain (not checked). */
    inTrancoTop100k: boolean | null;
  };
  /**
   * The variant's TLD rating, as on the website. For a looked-up variant only the org's brand
   * TLDs rate `official` (a lookalike on the org's own .com must not). Additive (ticket 18).
   */
  tld: TldRating;
  /** Where the facts came from. Additive (ticket 18). */
  dataSources: {
    /** Lookups run, in a stable order; `[]` for an official domain (none run). */
    lookups: string[];
    /** Lookups with at least one unknown fact (failed, timed out or not published). */
    unknown: string[];
    /** Build date of the bundled organisation data (`orgs.json`, Tranco set). */
    dataVersion: string;
  };
  /** `null`: not checked (official domain) or unknown. */
  existence: Existence | null;
  registration: {
    registrationDate: Value<string>;
    registrar: Value<string>;
    /** Earliest CT certificate; `"none"` when no certificate was ever logged. */
    firstCertDate: Value<string>;
  } | null;
  dns: {
    nameservers: Value<string[]>;
    mx: Value<string[]>;
    addresses: Value<string[]>;
    spf: Value<boolean>;
  } | null;
  hosting: { asns: Value<number[]> } | null;
  /** The org's primary domain, as compared against. */
  official: ExportInfra | null;
  /** `null` for an unregistered variant (no active threat, no verdict). */
  verdict: { label: VerdictLabel; score: number; unknownShare: number } | null;
  why: WhyItem[];
  rules: { id: RuleId; status: RuleStatus; weight: number; summary: string; explanation: string }[];
}

/**
 * One lookup to export: the final facts, or for a known official domain (no lookups run) the
 * similarity the lookup already computed.
 */
export type LookupExportInput = {
  org: Org;
  variant: ParsedVariant;
  exportedAt: Date;
} & ({ facts: Facts; similarity?: never } | { facts?: never; similarity: Similarity });

const value = <T>(f: Fact<T>): Value<T> => (f.state === 'known' ? f.value : null);

const infra = (f: InfraFacts): ExportInfra => ({
  domain: f.domain,
  registrationDate: value(f.registrationDate),
  registrar: value(f.registrar),
  nameservers: value(f.nameservers),
  mx: value(f.mx),
  addresses: value(f.addresses),
  asns: value(f.asns),
});

/** Build the export document for a finished lookup. */
export function toLookupExport(input: LookupExportInput): LookupExport {
  const { org, variant, facts, exportedAt } = input;
  const ctx = officialContext(org);
  const { brandLabel } = ctx;
  const sim = facts ? facts.variantFacts.similarity : input.similarity;
  const vf = facts?.variantFacts;
  const results = facts ? evaluate(facts) : [];
  const unregistered = vf ? isNotRegistered(vf.existence) : false;
  const v = facts ? verdict(results) : { verdict: 'Official' as const, score: 0, unknownShare: 0 };
  const firstCert = vf ? value(vf.firstCertDate) : null;

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    tool: 'izanami',
    kind: 'lookup',
    exportedAt: exportedAt.toISOString(),
    checkedAt: vf?.checkedAt ?? null,
    org: exportOrg(org),
    variant: {
      input: variant.input,
      unicode: variant.unicode,
      punycode: variant.punycode,
      registrableDomain: variant.registrableDomain,
    },
    analysis: {
      technique: sim.kind,
      techniqueLabel: techniqueLabel(sim.kind),
      editDistance: sim.editDistance,
      similarityPercent: similarityPercent(variant.label, brandLabel),
      homoglyphs: homoglyphSegments(variant.label, brandLabel).flatMap((s) =>
        s.swapped ? [{ text: s.text, looksLike: s.looksLike, codePoints: s.codePoints }] : [],
      ),
      inTrancoTop100k: vf ? vf.inTranco : null,
    },
    tld: rateTld(variant.tld, facts ? { brandTlds: ctx.brandTlds } : ctx),
    dataSources: {
      lookups: facts ? [...new Set(Object.values(FACT_SOURCES))] : [],
      unknown: facts
        ? [
            ...new Set([
              ...unknownSources(facts.variantFacts),
              ...unknownSources(facts.officialFacts),
            ]),
          ]
        : [],
      dataVersion,
    },
    existence: vf ? value(vf.existence) : null,
    registration: vf
      ? {
          registrationDate: value(vf.registrationDate),
          registrar: value(vf.registrar),
          firstCertDate:
            vf.firstCertDate.state === 'known' && firstCert === null ? 'none' : firstCert,
        }
      : null,
    dns: vf
      ? {
          nameservers: value(vf.nameservers),
          mx: value(vf.mx),
          addresses: value(vf.addresses),
          spf: value(vf.spf),
        }
      : null,
    hosting: vf ? { asns: value(vf.asns) } : null,
    official: facts ? infra(facts.officialFacts) : null,
    verdict: unregistered
      ? null
      : { label: v.verdict, score: v.score, unknownShare: v.unknownShare },
    why: facts ? whyList(facts, results) : [],
    rules: results.map((r) => ({
      id: r.id,
      status: r.status,
      weight: r.weight,
      summary: r.summary,
      explanation: r.explanation,
    })),
  };
}

const LOOKUP_CSV_HEADER = [
  'domain',
  'unicode',
  'org',
  'existence',
  'verdict',
  'score',
  'unknown_share',
  'checked_at',
  'rule_id',
  'rule_status',
  'rule_weight',
  'rule_summary',
  'rule_explanation',
] as const;

/** One row per rule (one row with empty rule columns when there are none). */
export function lookupToCsv(e: LookupExport): string {
  const head = [
    e.variant.registrableDomain,
    e.variant.unicode,
    e.org.name,
    e.existence,
    e.verdict?.label,
    e.verdict?.score,
    e.verdict && Math.round(e.verdict.unknownShare * 1000) / 1000,
    e.checkedAt,
  ];
  const rows = e.rules.length
    ? e.rules.map((r) => [...head, r.id, r.status, r.weight, r.summary, r.explanation])
    : [[...head, null, null, null, null, null]];
  return toCsv(LOOKUP_CSV_HEADER, rows);
}
