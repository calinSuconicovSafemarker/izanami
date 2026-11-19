import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16">
      <h1 className="font-mono text-2xl font-bold text-zinc-100">Page not found</h1>
      <p className="text-zinc-400">We don’t know that organisation or page.</p>
      <Link
        to="/orgs"
        className="self-start rounded-md border border-emerald-700 px-3 py-2 text-emerald-400 hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-emerald-400"
      >
        ← Back to all organisations
      </Link>
    </main>
  );
}
