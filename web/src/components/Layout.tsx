import { Link, Outlet, useLocation } from 'react-router-dom';
import { PrivacyPanel } from './PrivacyPanel';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

export function Layout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        onClick={(event) => {
          // Hash routing: don't let the skip link change the route.
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className={`sr-only rounded bg-zinc-900 px-3 py-2 text-emerald-400 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 ${focusRing}`}
      >
        Skip to content
      </a>
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3">
          <Link
            to="/"
            className={`rounded font-mono text-sm font-semibold text-emerald-400 hover:text-emerald-300 ${focusRing}`}
          >
            izanami
          </Link>
        </div>
      </header>
      <div id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </div>
      <footer className="border-t border-zinc-800 px-4 py-4 text-xs text-zinc-400">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
          <p>No backend, no analytics. Passive public lookups only.</p>
          {/* Re-keyed per route so an open dialog closes when the route changes. */}
          <PrivacyPanel key={location.key} />
        </div>
      </footer>
    </div>
  );
}
