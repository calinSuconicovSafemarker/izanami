import { useId, useState, type FormEvent } from 'react';
import { toUnicode } from 'punycode/';
import { officialContext, type Org } from '../orgs';
import { officialExplanation, type Existence, type Fact } from '../rules';
import type { TerminalLine } from './lines';
import { quickPickTlds, rateTld, TldBadge, type TldContext } from '../tld';
import { EXISTENCE_WORDING, withTld } from './wording';
import type { Lookup, LookupState } from './useLookup';

const toneClass: Record<TerminalLine['tone'], string> = {
  ok: 'text-zinc-200',
  muted: 'text-zinc-400',
  warn: 'text-amber-400',
};

function ExistenceLine({ existence, done }: { existence: Fact<Existence>; done: boolean }) {
  if (existence.state === 'known') {
    const color =
      existence.value === 'not-registered'
        ? 'text-emerald-400'
        : existence.value === 'resolving'
          ? 'text-red-400'
          : 'text-amber-400';
    return (
      <p data-existence={existence.value} className={`mt-2 font-semibold ${color}`}>
        {EXISTENCE_WORDING[existence.value]}
      </p>
    );
  }
  if (!done) return <p className="mt-2 animate-pulse text-zinc-400">Checking…</p>;
  return (
    <p data-existence="unknown" className="mt-2 font-semibold text-amber-400">
      Couldn&apos;t tell whether this domain exists — some lookups couldn&apos;t be checked.
    </p>
  );
}

function Output({
  state,
  tldContext,
  orgName,
}: {
  state: LookupState;
  tldContext: TldContext;
  orgName: string;
}) {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'invalid':
      return <p className="text-amber-400">{state.message}</p>;
    case 'official':
      return (
        <p data-existence="official" className="font-semibold text-emerald-400">
          Official domain —{' '}
          {state.brandTld
            ? officialExplanation(state.variant.unicode, orgName, state.brandTld)
            : `${state.variant.unicode} is a known official domain.`}
        </p>
      );
    case 'running':
    case 'done': {
      const { variant } = state;
      const registrableUnicode = toUnicode(variant.registrableDomain);
      return (
        <>
          <p className="text-zinc-400">
            <span className="text-emerald-400">&gt; </span>lookup {registrableUnicode}
          </p>
          <dl className="grid grid-cols-[6ch_1fr] gap-x-3">
            <dt className="text-zinc-400">unicode</dt>
            <dd className="break-all text-zinc-200">{registrableUnicode}</dd>
            <dt className="text-zinc-400">puny</dt>
            <dd className="break-all text-zinc-200">{variant.registrableDomain}</dd>
          </dl>
          <TldLine tld={variant.tld} context={tldContext} />
          {variant.unicode !== registrableUnicode && (
            <p className={variant.isSubdomainTrick ? 'text-red-400' : 'text-zinc-400'}>
              You typed {variant.unicode} — the registrable domain is {registrableUnicode}.
              {variant.isSubdomainTrick &&
                ' The part on the left is just a subdomain: whoever owns the registrable domain controls it.'}
            </p>
          )}
          <ul aria-label="Lookup results" className="mt-1">
            {state.lines.map((line, i) => (
              <li key={i} className="grid grid-cols-[6ch_1fr] gap-x-3">
                <span className="text-zinc-400">{line.source}</span>
                <span className={`break-all ${toneClass[line.tone]}`}>{line.text}</span>
              </li>
            ))}
          </ul>
          <ExistenceLine existence={state.existence} done={state.phase === 'done'} />
        </>
      );
    }
  }
}

function TldLine({ tld, context }: { tld: string; context: TldContext }) {
  const rating = rateTld(tld, context);
  return (
    <p className="flex flex-wrap items-center gap-2 text-zinc-400">
      <span className="sr-only">{`TLD .${rating.tld}: ${rating.label}`}</span>
      <span aria-hidden="true">tld .{rating.tld}</span>
      <span aria-hidden="true">
        <TldBadge rating={rating} />
      </span>
    </p>
  );
}

export interface LookupTerminalProps {
  org: Org;
  lookup: Lookup;
  /** Prefill (e.g. from a deep link); defaults to `<brandLabel>.`. Read on mount only. */
  initialInput?: string | null;
  onSubmit: (input: string) => void;
}

/** Terminal-styled lookup panel: input + TLD chips + raw result lines + existence state. */
export function LookupTerminal({ org, lookup, initialInput, onSubmit }: LookupTerminalProps) {
  const { brandLabel, brandTlds } = officialContext(org);
  // The looked-up variant is not official (that phase never reaches this line), so only a brand
  // TLD rates as official: a lookalike on the org's own .com must not read as "official".
  const tldContext: TldContext = { brandTlds };
  const [input, setInput] = useState(initialInput || `${brandLabel}.`);
  const inputId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) onSubmit(input.trim());
  };

  return (
    <section
      aria-labelledby="lookup-terminal-heading"
      className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-black/60 p-4 font-mono text-sm"
    >
      <h2 id="lookup-terminal-heading" className="text-xs uppercase tracking-wide text-zinc-400">
        Lookup terminal
      </h2>
      <form onSubmit={submit} className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Domain to check
        </label>
        <span aria-hidden="true" className="text-emerald-400">
          $
        </span>
        <input
          id={inputId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-zinc-100 caret-emerald-400 outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
          className="rounded border border-emerald-500/60 px-3 py-1 text-emerald-400 hover:bg-emerald-500/10 focus-visible:outline-2 focus-visible:outline-emerald-400"
        >
          Check
        </button>
      </form>
      <ul aria-label="Quick TLDs" className="flex flex-wrap gap-2">
        {quickPickTlds(org).map((rating) => (
          <li key={rating.tld}>
            <button
              type="button"
              aria-label={`.${rating.tld} ${rating.label} TLD`}
              onClick={() => setInput(withTld(input, rating.tld, brandLabel))}
              className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-400 ${rating.category === 'high-abuse' ? 'border-dashed border-amber-500/70' : 'border-zinc-700'}`}
            >
              .{rating.tld} <TldBadge rating={rating} />
            </button>
          </li>
        ))}
      </ul>
      <div role="log" aria-label="Lookup output" aria-live="polite" className="flex flex-col gap-1">
        <Output state={lookup.state} tldContext={tldContext} orgName={org.name} />
      </div>
    </section>
  );
}
