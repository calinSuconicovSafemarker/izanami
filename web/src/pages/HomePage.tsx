import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { searchOrgs } from '../orgs';

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
        <h1 className="font-mono text-2xl font-bold tracking-tight text-emerald-400 sm:text-3xl">
          Lookalike Checker
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
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-base text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        <p id="org-search-hint" className="text-xs text-zinc-500">
          Press <kbd className="rounded border border-zinc-700 px-1 font-mono">/</kbd> to search,{' '}
          <kbd className="rounded border border-zinc-700 px-1 font-mono">Enter</kbd> to open the
          first result. {results.length} shown.
        </p>
      </div>

      {results.length === 0 ? (
        <p className="text-zinc-400">No organisation matches “{query.trim()}”.</p>
      ) : (
        <ul
          aria-label="Organisations"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {results.map((org) => (
            <li key={org.slug}>
              <Link
                to={`/org/${org.slug}`}
                className="flex h-full flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 hover:border-emerald-600 focus-visible:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-500"
              >
                <span className="font-medium break-words text-zinc-100">{org.name}</span>
                <span className="font-mono text-sm break-all text-zinc-400">
                  {org.primaryDomain}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
