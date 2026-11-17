import { Link, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3">
          <Link
            to="/"
            className="font-mono text-sm font-semibold text-emerald-400 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            lookalike-checker
          </Link>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="border-t border-zinc-800 px-4 py-4 text-center text-xs text-zinc-500">
        Heuristic, not a guarantee. Passive public lookups only.
      </footer>
    </div>
  );
}
