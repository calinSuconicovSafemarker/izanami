import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { domainsToCsv } from '../export/domains';
import { downloadCsv } from '../export/download';
import { exportFilename } from '../export/filename';
import { allOrgs, searchOrgs, type Org } from '../orgs';

/** Column layout shared by the header and every row: rank, name, domain, country, tier, count. */
const ROW_GRID =
  'grid grid-cols-[3rem_1fr] gap-x-4 px-4 sm:grid-cols-[3rem_1.4fr_1fr_7rem] md:grid-cols-[3rem_1.4fr_1fr_4rem_6rem_7rem]';
const HEADER_CELLS =
  'border-b border-zinc-800 bg-zinc-900/80 py-2 font-mono text-[11px] tracking-[0.2em] text-zinc-400 uppercase';

/** Position in the full list (most popular first), stable while filtering. */
const rank = new Map(allOrgs.map((org, i) => [org.slug, i + 1]));

const TIER_LABEL: Record<number, string> = {
  1_000: 'TOP 1K',
  10_000: 'TOP 10K',
  100_000: 'TOP 100K',
  1_000_000: 'TOP 1M',
};

function PopularityTag({ org }: { org: Org }) {
  if (!org.popularity) return <span className="font-mono text-xs text-zinc-400">CURATED</span>;
  const top = org.popularity.bucket === 1_000;
  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 font-mono text-[11px] tracking-wider ${
        top ? 'border-emerald-800 text-emerald-400' : 'border-zinc-700 text-zinc-300'
      }`}
    >
      {TIER_LABEL[org.popularity.bucket]}
    </span>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function HomePage() {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const results = searchOrgs(query);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || isTypingTarget(event.target)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const first = results[0];
    if (event.key === 'Enter' && first) navigate(`/org/${first.slug}`);
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs tracking-[0.3em] text-zinc-400 uppercase">Organisations</p>
        <h1 className="font-mono text-2xl font-bold tracking-[0.15em] text-emerald-400 uppercase sm:text-3xl">
          Select organisation
        </h1>
        <p className="text-sm text-zinc-400 sm:text-base">
          Pick an organisation to see its known official domains, then check whether another domain
          is a lookalike.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="org-search" className="text-sm font-medium text-zinc-300">
          Search organisations
        </label>
        <input
          ref={searchRef}
          id="org-search"
          type="search"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Name or domain, e.g. delft or tudelft.nl"
          aria-describedby="org-search-hint"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-base text-zinc-100 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        <p id="org-search-hint" className="text-xs text-zinc-400">
          Press <kbd className="rounded border border-zinc-700 px-1 font-mono">/</kbd> to search,{' '}
          <kbd className="rounded border border-zinc-700 px-1 font-mono">Enter</kbd> to open the
          first result. {results.length} shown.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-y border-zinc-800 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p id="all-domains-hint" className="text-xs text-zinc-400">
          Every organisation’s legitimate domains in one file: official ones and Wikidata-listed
          ones to verify. Sources:{' '}
          <Link to="/credits" className="text-emerald-400 hover:text-emerald-300">
            credits
          </Link>
          .
        </p>
        <button
          type="button"
          aria-describedby="all-domains-hint"
          onClick={() =>
            downloadCsv(exportFilename('all-domains', new Date(), 'csv'), domainsToCsv(allOrgs))
          }
          className="shrink-0 self-start rounded-sm border border-emerald-600 px-3 py-1.5 font-mono text-xs tracking-[0.15em] text-emerald-400 uppercase hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:self-auto"
        >
          ↓ Download all domains (CSV)
        </button>
      </div>

      {results.length === 0 ? (
        <p className="text-zinc-400">No organisation matches “{query.trim()}”.</p>
      ) : (
        <div className="overflow-hidden rounded-sm border border-zinc-800">
          <div aria-hidden="true" className={`${ROW_GRID} ${HEADER_CELLS}`}>
            <span>#</span>
            <span>Organisation</span>
            <span className="hidden sm:block">Primary domain</span>
            <span className="hidden md:block">Country</span>
            <span className="hidden md:block">Popularity</span>
            <span className="hidden text-right sm:block">Domains</span>
          </div>
          <ul aria-label="Organisations" className="divide-y divide-zinc-800/80">
            {results.map((org) => (
              <li key={org.slug}>
                <Link
                  to={`/org/${org.slug}`}
                  className={`${ROW_GRID} group items-center py-2.5 text-sm hover:bg-emerald-500/5 focus-visible:bg-emerald-500/10 focus-visible:outline-none`}
                >
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">
                    {String(rank.get(org.slug)).padStart(4, '0')}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-zinc-100 group-hover:text-emerald-400">
                      {org.name}
                    </span>
                    <span className="truncate font-mono text-xs text-zinc-400 sm:hidden">
                      {org.primaryDomain}
                    </span>
                  </span>
                  <span className="hidden truncate font-mono text-zinc-300 sm:block">
                    {org.primaryDomain}
                  </span>
                  <span className="hidden font-mono text-xs text-zinc-400 md:block">
                    {org.country ?? '—'}
                  </span>
                  <span className="hidden md:block">
                    <PopularityTag org={org} />
                  </span>
                  <span className="hidden text-right font-mono text-xs text-zinc-400 tabular-nums sm:block">
                    {org.officialDomains.length + org.relatedDomains.length}
                    {/* Fixed-width slot so the counts stay aligned with or without the badge. */}
                    <span className="ml-2 inline-block w-9 text-center">
                      {org.brandTlds.length > 0 && (
                        <span
                          title="Runs its own top-level domain"
                          className="rounded-sm border border-emerald-800 px-1 text-emerald-400"
                        >
                          TLD
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden="true"
                      className="ml-3 text-zinc-400 group-hover:text-emerald-400"
                    >
                      ›
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
