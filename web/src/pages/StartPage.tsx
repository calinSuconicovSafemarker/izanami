import { Link } from 'react-router-dom';
import { allOrgs, dataVersion } from '../orgs';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

const CAPABILITIES = [
  {
    code: '01',
    title: 'Similarity',
    text: 'Typosquatting, look-alike characters, keyword and TLD swaps, scored against the organisation’s official domains.',
  },
  {
    code: '02',
    title: 'Ownership',
    text: 'Official and related domains from Wikidata, brand TLDs and the vendors’ own published lists.',
  },
  {
    code: '03',
    title: 'Registration',
    text: 'Live DNS, RDAP, hosting network and certificate history, using passive public lookups only.',
  },
  {
    code: '04',
    title: 'Verdict',
    text: 'Every rule shown with its weight and the reason it fired. Export the result as CSV or JSON.',
  },
] as const;

export function StartPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12 sm:py-20">
      <section aria-labelledby="start-title" className="flex flex-col gap-6">
        <p className="font-mono text-xs tracking-[0.3em] text-zinc-400 uppercase">
          Lookalike domain analysis
        </p>
        <h1
          id="start-title"
          className="font-mono text-5xl font-bold tracking-[0.2em] text-emerald-400 sm:text-7xl"
        >
          IZANAMI
        </h1>
        <p className="max-w-2xl text-base text-zinc-300 sm:text-lg">
          Check whether a domain impersonates a known organisation. Each verdict is built from
          public evidence and shows exactly why.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/orgs"
            className={`rounded-sm border border-emerald-500 bg-emerald-500 px-6 py-3 font-mono text-sm font-semibold tracking-[0.2em] text-black uppercase hover:bg-emerald-400 ${focusRing}`}
          >
            Start analysis →
          </Link>
          <Link
            to="/credits"
            className={`rounded-sm border border-zinc-700 px-6 py-3 font-mono text-sm tracking-[0.2em] text-zinc-300 uppercase hover:border-zinc-500 hover:text-zinc-100 ${focusRing}`}
          >
            Sources
          </Link>
        </div>
      </section>

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-zinc-800 bg-zinc-800 font-mono text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-1 bg-zinc-950 p-4">
          <dt className="text-xs tracking-[0.2em] text-zinc-400 uppercase">Organisations</dt>
          <dd className="text-xl text-zinc-100">{allOrgs.length.toLocaleString('en')}</dd>
        </div>
        <div className="flex flex-col gap-1 bg-zinc-950 p-4">
          <dt className="text-xs tracking-[0.2em] text-zinc-400 uppercase">Data version</dt>
          <dd className="text-xl text-zinc-100">{dataVersion}</dd>
        </div>
        <div className="flex flex-col gap-1 bg-zinc-950 p-4">
          <dt className="text-xs tracking-[0.2em] text-zinc-400 uppercase">Lookups</dt>
          <dd className="text-xl text-zinc-100">Passive only</dd>
        </div>
      </dl>

      <section aria-labelledby="start-capabilities" className="flex flex-col gap-4">
        <h2
          id="start-capabilities"
          className="font-mono text-xs tracking-[0.3em] text-zinc-400 uppercase"
        >
          What it checks
        </h2>
        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
          {CAPABILITIES.map((item) => (
            <li key={item.code} className="flex flex-col gap-2 bg-zinc-950 p-5">
              <span className="font-mono text-xs tracking-[0.2em] text-emerald-500">
                {item.code} / {item.title.toUpperCase()}
              </span>
              <span className="text-sm text-zinc-400">{item.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <aside
        aria-label="Intended use"
        className="border-l-2 border-amber-500 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300"
      >
        <span className="font-mono text-xs tracking-[0.2em] text-amber-400 uppercase">
          Intended use
        </span>
        <p className="mt-1">
          For security analysts. Results are heuristics, not proof of ownership or intent. Verify
          before acting on a verdict.
        </p>
      </aside>
    </main>
  );
}
