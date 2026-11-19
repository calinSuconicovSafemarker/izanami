import type { Org } from '../orgs';
import type { LookupState } from '../lookup-ui/useLookup';
import type { ScanState } from '../scan';
import { downloadCsv, downloadJson } from './download';
import { exportFilename } from './filename';
import { lookupToCsv, toLookupExport } from './lookup';
import { scanToCsv, toScanExport } from './scan';

interface ExportButtonsProps<T> {
  /** File name subject: `izanami-<subject>-<stamp>.<ext>`. */
  subject: string;
  /** Builds the JSON document at click time. */
  json: (exportedAt: Date) => T;
  csv: (doc: T) => string;
}

const BUTTON =
  'rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-emerald-400';

function ExportButtons<T>({ subject, json, csv }: ExportButtonsProps<T>) {
  const save = (format: 'json' | 'csv') => {
    const at = new Date();
    const doc = json(at);
    const name = exportFilename(subject, at, format);
    if (format === 'json') downloadJson(name, doc);
    else downloadCsv(name, csv(doc));
  };
  return (
    <div role="group" aria-label="Export" className="flex flex-wrap gap-2">
      <button type="button" className={BUTTON} onClick={() => save('json')}>
        Export JSON
      </button>
      <button type="button" className={BUTTON} onClick={() => save('csv')}>
        Export CSV
      </button>
    </div>
  );
}

/** Export a finished lookup (`done`) or an official-domain result; nothing otherwise. */
export function LookupExportButtons({ org, state }: { org: Org; state: LookupState }) {
  if (state.phase !== 'done' && state.phase !== 'official') return null;
  const { variant } = state;
  const from =
    state.phase === 'official' ? { similarity: state.similarity } : { facts: state.facts };
  return (
    <ExportButtons
      subject={variant.registrableDomain}
      json={(exportedAt) => toLookupExport({ org, variant, exportedAt, ...from })}
      csv={lookupToCsv}
    />
  );
}

/** Export the scan results table once it has rows. */
export function ScanExportButtons({ org, state }: { org: Org; state: ScanState }) {
  if (state.phase === 'idle' || state.rows.length === 0) return null;
  return (
    <ExportButtons
      subject={`scan-${org.slug}`}
      json={(exportedAt) => toScanExport({ org, state, exportedAt })}
      csv={scanToCsv}
    />
  );
}
