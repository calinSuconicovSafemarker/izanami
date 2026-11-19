import { Link } from 'react-router-dom';
import {
  creditsIn,
  GROUP_TITLES,
  MIT_NOTICE,
  SOFTWARE,
  UNICODE_NOTICE,
  type Credit,
} from '../credits/sources';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';
const link = `rounded text-emerald-400 underline-offset-2 hover:underline ${focusRing}`;

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
      {children}
    </a>
  );
}

function CreditItem({ credit }: { credit: Credit }) {
  return (
    <li className="flex flex-col gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <External href={credit.url}>{credit.name}</External>
      <p className="text-sm text-zinc-300">{credit.usedFor}</p>
      <p className="text-xs text-zinc-400">
        Licence: <External href={credit.licence.url}>{credit.licence.name}</External>
      </p>
      {credit.attribution && (
        <p className="text-xs text-zinc-400">
          Attribution: <span className="text-zinc-300">{credit.attribution}</span>
        </p>
      )}
      {credit.note && <p className="text-xs text-amber-300">{credit.note}</p>}
    </li>
  );
}

function Section({ id, group }: { id: string; group: Credit['group'] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-mono text-lg font-semibold text-zinc-100">
        {GROUP_TITLES[group]}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {creditsIn(group).map((c) => (
          <CreditItem key={c.id} credit={c} />
        ))}
      </ul>
    </section>
  );
}

function Notice({ summary, text }: { summary: string; text: string }) {
  return (
    <details className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
      <summary className={`cursor-pointer text-zinc-300 ${focusRing}`}>{summary}</summary>
      <pre className="mt-2 font-sans whitespace-pre-wrap">{text}</pre>
    </details>
  );
}

export function CreditsPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-mono text-2xl font-bold text-zinc-100">Credits and licences</h1>
        <p className="text-sm text-zinc-400">
          Izanami is built on public data and free services. Thank you to everyone below. Results
          are heuristics, not proof. None of these sources endorses Izanami.
        </p>
      </div>

      <Section id="credits-build" group="build" />
      <Section id="credits-live" group="live" />

      <section aria-labelledby="credits-software" className="flex flex-col gap-3">
        <h2 id="credits-software" className="font-mono text-lg font-semibold text-zinc-100">
          {GROUP_TITLES.software}
        </h2>
        <p className="text-sm text-zinc-400">
          Libraries shipped in this site. All are MIT licensed; each copyright line goes with the
          MIT notice below.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SOFTWARE.map((s) => (
            <li
              key={s.name}
              className="flex flex-col gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-3"
            >
              <External href={s.url}>{s.name}</External>
              <p className="text-xs text-zinc-400">
                Licence: <External href={s.licence.url}>{s.licence.name}</External>
              </p>
              <p className="text-xs text-zinc-400">{s.copyright}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="credits-notices" className="flex flex-col gap-3">
        <h2 id="credits-notices" className="font-mono text-lg font-semibold text-zinc-100">
          Licence notices
        </h2>
        <Notice summary="Unicode License V3 (confusables data)" text={UNICODE_NOTICE} />
        <Notice summary="MIT License (libraries above)" text={MIT_NOTICE} />
      </section>

      <Link
        to="/"
        className={`self-start rounded-md border border-emerald-700 px-3 py-2 text-emerald-400 hover:bg-emerald-950 ${focusRing}`}
      >
        ← Back to all organisations
      </Link>
    </main>
  );
}
