// Export of the lookalike scan results table (SPEC "Export"). Pure: no DOM, no I/O.
import { techniqueLabel } from '../domain';
import type { Org } from '../orgs';
import type { Exists, ScanState } from '../scan';
import type { TldCategory } from '../tld';
import { toCsv } from './csv';
import {
  EXPORT_SCHEMA_VERSION,
  exportOrg,
  scanSources,
  type ExportOrg,
  type ExportSource,
} from './common';

export interface ScanExport {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  tool: 'izanami';
  kind: 'lookalike-scan';
  /** ISO 8601. */
  exportedAt: string;
  org: ExportOrg;
  /** `checked < total` when the scan was cancelled or is still running. */
  scan: {
    status: 'running' | 'done' | 'cancelled';
    total: number;
    checked: number;
    registered: number;
  };
  candidates: {
    /** Punycode. */
    domain: string;
    /** Unicode, as shown in the table. */
    display: string;
    /** Technique id (`omission`, `tld-swap` …). */
    technique: string;
    /** Human label for the technique (`Omission`). */
    techniqueLabel: string;
    tld: string;
    /** Badge text, e.g. `country · France`. */
    tldRating: string;
    tldCategory: TldCategory;
    exists: Exists;
    nameservers: string[];
    /** ISO 8601. */
    checkedAt: string;
  }[];
  /** Data sources with licence and attribution (ticket 17); additive, schema version unchanged. */
  sources: ExportSource[];
}

export interface ScanExportInput {
  org: Org;
  state: Exclude<ScanState, { phase: 'idle' }>;
  exportedAt: Date;
}

export function toScanExport({ org, state, exportedAt }: ScanExportInput): ScanExport {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    tool: 'izanami',
    kind: 'lookalike-scan',
    exportedAt: exportedAt.toISOString(),
    org: exportOrg(org),
    scan: {
      status: state.phase,
      total: state.total,
      checked: state.rows.length,
      registered: state.rows.filter((r) => r.exists === 'yes').length,
    },
    candidates: state.rows.map((r) => ({
      domain: r.candidate.domain,
      display: r.candidate.display,
      technique: r.candidate.technique,
      techniqueLabel: techniqueLabel(r.candidate.technique),
      tld: r.candidate.tld,
      tldRating: r.rating.label,
      tldCategory: r.rating.category,
      exists: r.exists,
      nameservers: [...r.nameservers],
      checkedAt: r.checkedAt,
    })),
    sources: scanSources(),
  };
}

const SCAN_CSV_HEADER = [
  'candidate',
  'domain',
  'technique',
  'tld',
  'tld_rating',
  'exists',
  'checked_at',
] as const;

export function scanToCsv(e: ScanExport): string {
  return toCsv(
    SCAN_CSV_HEADER,
    e.candidates.map((c) => [
      c.display,
      c.domain,
      c.technique,
      c.tld,
      c.tldRating,
      c.exists,
      c.checkedAt,
    ]),
  );
}
