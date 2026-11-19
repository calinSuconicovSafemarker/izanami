import { useId, type ReactNode } from 'react';
import type { LookalikeKind } from '../domain';
import { homoglyphSegments, registrationAge, similarityPercent } from '../domain/analysis';
import { isNotRegistered, type Fact, type Facts } from '../rules';

export interface DomainAnalysisPanelProps {
  /** Latest facts snapshot (pending facts render as "checking…"). */
  facts: Facts;
  /** Optional extra content under the technique, e.g. a rating of the variant's TLD. */
  tldRating?: ReactNode;
}

const TECHNIQUES: Record<LookalikeKind, { label: string; description: string }> = {
  official: {
    label: 'Official',
    description: "One of the organisation's known official domains.",
  },
  'tld-swap': {
    label: 'TLD swap',
    description:
      "The same name under a different extension, betting you won't notice how the address ends.",
  },
  typo: {
    label: 'Typo-squat',
    description:
      'One or two characters added, dropped, swapped or replaced to catch people who mistype the address.',
  },
  homoglyph: {
    label: 'Homoglyph',
    description:
      'Letters replaced by look-alike characters, often from another alphabet, so the name reads the same.',
  },
  combo: {
    label: 'Combo-squat',
    description:
      'The brand name plus an extra word (login, secure, support…) to pass as an official service.',
  },
  'subdomain-trick': {
    label: 'Subdomain trick',
    description:
      "The brand sits in a subdomain of someone else's domain; the real owner is the part at the end.",
  },
  unrelated: {
    label: 'Unrelated',
    description: 'Does not closely resemble the brand: no typosquatting technique detected.',
  },
};

const NOT_PUBLISHED = 'not published by registry';

/** Render a fact: its value, "checking…" while pending, or `unknownText` when unknown. */
function show<T>(fact: Fact<T>, render: (value: T) => ReactNode, unknownText: string): ReactNode {
  if (fact.state === 'pending') return <Muted>checking…</Muted>;
  if (fact.state === 'unknown') return <Muted>{unknownText}</Muted>;
  return render(fact.value);
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="text-zinc-400">{children}</span>
);

const Shared = ({ domain }: { domain: string }) => (
  <span className="ml-2 rounded border border-emerald-500/60 px-1.5 text-xs text-emerald-300">
    shared with {domain}
  </span>
);

const overlaps = <T,>(a: Fact<T[]>, b: Fact<T[]>) =>
  a.state === 'known' && b.state === 'known' && a.value.some((x) => b.value.includes(x));

const list = (xs: string[], empty = 'none') => (xs.length ? xs.join(', ') : <Muted>{empty}</Muted>);

/**
 * Domain-level details of a looked-up variant: the typosquatting technique, how similar it is to
 * the brand, its Unicode/punycode forms, registration data and hosting. Purely presentational.
 */
export function DomainAnalysisPanel({ facts, tldRating }: DomainAnalysisPanelProps) {
  const headingId = useId();
  const { variantFacts: v, officialFacts: o } = facts;
  const technique = TECHNIQUES[v.similarity.kind];
  const label = v.unicode.split('.')[0] ?? '';
  const percent = similarityPercent(label, v.brandLabel);
  const swaps = v.similarity.homoglyph ? homoglyphSegments(label, v.brandLabel) : [];
  const notRegistered = isNotRegistered(v.existence);
  const unknownRdap = notRegistered ? 'not registered' : NOT_PUBLISHED;
  const age = (date: string) => registrationAge(date, v.checkedAt);

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm"
    >
      <h2 id={headingId} className="mb-3 text-base font-semibold text-zinc-100">
        Domain analysis
      </h2>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr] [&>dd]:mb-2 [&>dd]:break-words [&>dd]:text-zinc-200 sm:[&>dd]:mb-0 [&>dt]:text-zinc-400">
        <dt>Technique</dt>
        <dd>
          <span className="font-semibold">{technique.label}</span>
          <span className="block text-zinc-400">{technique.description}</span>
          {tldRating}
        </dd>

        <dt>Similarity</dt>
        <dd>
          {swaps.length > 0 && (
            <span className="block font-mono">
              {swaps.map((s, i) =>
                s.swapped ? (
                  <mark
                    key={i}
                    title={`${s.codePoints} looks like ${s.looksLike}`}
                    className="rounded-sm bg-amber-400 px-px text-black"
                  >
                    {s.text}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </span>
          )}
          <span className="block">
            Edit distance {v.similarity.editDistance} · {percent}% similar to {v.brandLabel}
          </span>
          {swaps
            .filter((s) => s.swapped)
            .map((s, i) => (
              <span key={i} className="block text-amber-300">
                {s.text} ({s.codePoints}) looks like {s.looksLike}
              </span>
            ))}
        </dd>

        <dt>Unicode</dt>
        <dd className="font-mono">{v.unicode}</dd>
        <dt>Punycode</dt>
        <dd className="font-mono">{v.domain}</dd>

        <dt>Registered</dt>
        <dd>{show(v.registrationDate, age, unknownRdap)}</dd>
        <dt>Registrar</dt>
        <dd>{show(v.registrar, (r) => r, unknownRdap)}</dd>
        <dt>Nameservers</dt>
        <dd>
          {show(v.nameservers, (ns) => list(ns), unknownRdap)}
          {overlaps(v.nameservers, o.nameservers) && <Shared domain={o.domain} />}
        </dd>
        <dt>Official registered</dt>
        <dd>
          {o.domain}: {show(o.registrationDate, age, NOT_PUBLISHED)}
        </dd>

        <dt>Hosting</dt>
        <dd>
          {show(v.addresses, (ips) => list(ips, 'no addresses'), "couldn't check")}
          {v.asns.state === 'known' && v.asns.value.length > 0 && (
            <span> · {v.asns.value.map((n) => `AS${n}`).join(', ')}</span>
          )}
          {(overlaps(v.addresses, o.addresses) || overlaps(v.asns, o.asns)) && (
            <Shared domain={o.domain} />
          )}
        </dd>
      </dl>
    </section>
  );
}
