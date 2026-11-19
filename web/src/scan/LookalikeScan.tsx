import { Link } from 'react-router-dom';
import type { Org } from '../orgs';
import { TldBadge } from '../tld';
import type { Exists } from './scan';
import { useLookalikeScan, type ScanState } from './useLookalikeScan';

const EXISTS: Record<Exists, { text: string; className: string }> = {
  yes: { text: 'registered', className: 'text-red-400' },
  no: { text: 'not registered', className: 'text-emerald-400' },
  unknown: { text: 'unknown', className: 'text-amber-400' },
};

function Status({ state }: { state: ScanState }) {
  if (state.phase === 'idle') return null;
  const checked = state.rows.length;
  const registered = state.rows.filter((r) => r.exists === 'yes').length;
  const progress = `${checked} / ${state.total} checked, ${registered} registered`;
  const prefix =
    state.phase === 'running'
      ? 'Scanning…'
      : state.phase === 'done'
        ? 'Scan complete:'
        : 'Scan cancelled:';
  return (
    <p role="status" className="text-zinc-300">
      {prefix} {progress}
    </p>
  );
}

export interface LookalikeScanProps {
  org: Org;
  /** Single-owner TLDs to rate as `brand` (optional until brand-TLD data exists). */
  brandTlds?: readonly string[];
  /** Pause between DoH queries per worker (tests pass 0). */
  delayMs?: number;
}

/**
 * "Lookalike scan": generates bounded typo/TLD candidates for the org's brand and checks
 * which exist with one DoH NS query each (≤4 in parallel, paced, cancellable).
 */
export function LookalikeScan({ org, brandTlds, delayMs }: LookalikeScanProps) {
  const { state, candidates, start, cancel } = useLookalikeScan(org, { brandTlds, delayMs });
  const running = state.phase === 'running';

  return (
    <section
      aria-labelledby="lookalike-scan-heading"
      className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm"
    >
      <h2 id="lookalike-scan-heading" className="text-base font-semibold text-zinc-100">
        Lookalike scan
      </h2>
      <p className="text-zinc-400">
        Checks {candidates.length} typo and TLD variants of the brand at once. Passive DNS lookups
        only: one NS query per name via DNS-over-HTTPS, at most 4 at a time.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="rounded border border-emerald-500/60 px-3 py-1 text-emerald-400 hover:bg-emerald-500/10 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50"
        >
          Scan lookalikes
        </button>
        {running && (
          <button
            type="button"
            onClick={cancel}
            className="rounded border border-zinc-600 px-3 py-1 text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            Cancel
          </button>
        )}
      </div>
      <Status state={state} />
      {state.phase !== 'idle' && state.rows.length > 0 && (
        <div
          tabIndex={0}
          role="region"
          aria-label="Scan results"
          className="max-h-96 overflow-auto rounded border border-zinc-800"
        >
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
              <tr>
                <th scope="col" className="px-2 py-1 font-normal">
                  Candidate
                </th>
                <th scope="col" className="px-2 py-1 font-normal">
                  Technique
                </th>
                <th scope="col" className="px-2 py-1 font-normal">
                  TLD
                </th>
                <th scope="col" className="px-2 py-1 font-normal">
                  Exists?
                </th>
                <th scope="col" className="px-2 py-1 font-normal">
                  <span className="sr-only">Full lookup</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.candidate.domain} className="border-t border-zinc-800">
                  <th scope="row" className="px-2 py-1 font-normal break-all text-zinc-200">
                    {row.candidate.display}
                  </th>
                  <td className="px-2 py-1 text-zinc-300">{row.candidate.technique}</td>
                  <td className="px-2 py-1">
                    <TldBadge rating={row.rating} />
                  </td>
                  <td className={`px-2 py-1 ${EXISTS[row.exists].className}`}>
                    {EXISTS[row.exists].text}
                  </td>
                  <td className="px-2 py-1">
                    <Link
                      to={{ search: `?d=${encodeURIComponent(row.candidate.display)}` }}
                      className="text-emerald-400 underline hover:text-emerald-300"
                    >
                      Check<span className="sr-only"> {row.candidate.display}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
