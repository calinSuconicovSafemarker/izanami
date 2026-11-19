import { useId, type ReactNode } from 'react';
import {
  evaluate,
  isAwaitingLookup,
  officialExplanation,
  unknownSources,
  verdict,
  whyList,
  type Facts,
  type RuleId,
  type RuleResult,
  type Verdict,
  type VerdictLabel,
  type WhyItem,
} from '../rules';

export interface VerdictCardProps {
  /** Latest facts snapshot (may contain pending facts while `done` is false). */
  facts: Facts;
  /** Every lookup settled: the verdict is final. */
  done: boolean;
  /** Shown at the bottom of the card once the verdict is final (e.g. export buttons). */
  actions?: ReactNode;
}

const RULE_LABELS: Record<RuleId, string> = {
  'official-match': 'Official domain',
  'young-domain': 'Young domain',
  'much-newer': 'Much newer than the official domain',
  'brand-lookalike': 'Brand lookalike',
  'not-in-tranco': 'Not a popular domain',
  'same-nameservers': 'Same nameservers',
  'same-registrar': 'Same registrar',
  'same-mx': 'Same mail provider',
  'same-asn': 'Same hosting network',
  'no-mx': 'No mail setup',
  'mail-ready': 'Set up to send mail',
  'fresh-cert': 'Fresh TLS certificate',
  'registered-not-resolving': 'Registered but not live',
  'odd-tld': 'Unusual TLD',
  'listed-related': 'Listed as owned (Wikidata)',
};

/** e.g. `DNS, RDAP and ASN for tudelft.online; RDAP for tudelft.nl`. */
function failedSources({ variantFacts, officialFacts }: Facts): string {
  const forDomain = (facts: Parameters<typeof unknownSources>[0], domain: string) => {
    const names = unknownSources(facts);
    return names.length ? `${joinAnd(names)} for ${domain}` : undefined;
  };
  return [
    forDomain(variantFacts, variantFacts.domain),
    forDomain(officialFacts, officialFacts.domain),
  ]
    .filter(Boolean)
    .join('; ');
}

const joinAnd = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

const VERDICT_STYLE: Record<VerdictLabel, { icon: string; className: string }> = {
  Official: { icon: '✓', className: 'border-emerald-500/60 text-emerald-400' },
  'Likely legit': { icon: '✓', className: 'border-emerald-500/60 text-emerald-400' },
  Suspicious: { icon: '!', className: 'border-amber-500/60 text-amber-400' },
  'Likely fraud': { icon: '✕', className: 'border-red-500/60 text-red-400' },
  'Insufficient data': { icon: '?', className: 'border-zinc-600 text-zinc-300' },
};

function summary(v: Verdict, facts: Facts): string {
  const { variantFacts: vf, officialFacts: of } = facts;
  switch (v.verdict) {
    case 'Official':
      return `${vf.unicode} is a known official domain of ${vf.orgName}.`;
    case 'Likely legit':
      return `Legit signals outweigh risk signals: ${vf.unicode} looks like a legitimate or defensive registration, often by ${vf.orgName} itself.`;
    case 'Suspicious':
      return `Some risk signals fired and too little ties ${vf.unicode} to ${of.domain}: treat it with care.`;
    case 'Likely fraud':
      return `Strong risk signals and nothing tying ${vf.unicode} to ${of.domain}: do not trust it.`;
    case 'Insufficient data':
      return `Too much couldn't be checked to give a verdict — unavailable: ${failedSources(facts) || 'several lookups'}.`;
  }
}

function VerdictHeader({ v, text }: { v: Verdict; text: string }) {
  const style = VERDICT_STYLE[v.verdict];
  return (
    <div className={`flex flex-col gap-1 border-l-4 pl-3 ${style.className}`}>
      <p className="flex items-center gap-2 text-base font-semibold">
        <span
          aria-hidden="true"
          className="inline-flex size-6 items-center justify-center rounded-full border border-current text-sm"
        >
          {style.icon}
        </span>
        {v.verdict}
        {v.verdict !== 'Official' && (
          <span className="ml-auto text-sm font-normal tabular-nums text-zinc-400">
            Score {formatWeight(v.score)}
          </span>
        )}
      </p>
      <p className="text-zinc-300">{text}</p>
    </div>
  );
}

const WHY_STYLE: Record<WhyItem['kind'], string> = {
  risk: 'text-amber-300',
  legit: 'text-emerald-300',
  unknown: 'text-zinc-400',
};

/** The top reasons for the verdict, read right after it. */
function WhyList({ items }: { items: WhyItem[] }) {
  const id = useId();
  return (
    <div className="pl-4">
      <h3 id={id} className="sr-only">
        Why
      </h3>
      <ul aria-labelledby={id} className="flex flex-col gap-0.5">
        {items.map((w) => (
          <li key={w.id} className="grid grid-cols-[5ch_1fr] gap-x-3">
            <span className={`text-right tabular-nums ${WHY_STYLE[w.kind]}`}>
              {w.kind === 'unknown' ? '?' : formatWeight(w.weight)}
            </span>{' '}
            <span className="text-zinc-200">{w.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** `+40`, `−25` (true minus sign), `0`. */
const formatWeight = (w: number) => (w > 0 ? `+${w}` : w < 0 ? `−${-w}` : '0');

function RuleList({
  title,
  rules,
  pending = false,
}: {
  title: string;
  rules: RuleResult[];
  pending?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <h3 id={id} className="mb-1 text-xs uppercase tracking-wide text-zinc-400">
        {title} ({rules.length})
      </h3>
      <ul aria-labelledby={id} className="flex flex-col gap-1">
        {rules.map((r) => (
          <li key={r.id} className="grid grid-cols-[5ch_1fr] gap-x-3">
            <span className="text-right tabular-nums text-zinc-400">
              {r.status === 'not-applicable' ? 'n/a' : formatWeight(r.weight)}
            </span>
            <span>
              <span className="text-zinc-200">{RULE_LABELS[r.id]}</span>
              {pending ? (
                <span className="animate-pulse text-zinc-400"> — still checking…</span>
              ) : (
                <span className="text-zinc-400"> — {r.explanation}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** e.g. `Verdict: Likely fraud. Why: Registered 12 days ago; Contains "tudelft".` */
const announce = (v: Verdict, why: WhyItem[]) =>
  why.length
    ? `Verdict: ${v.verdict}. Why: ${why.map((w) => w.summary).join('; ')}.`
    : `Verdict: ${v.verdict}`;

/** Verdict and every rule's outcome for one lookup. */
export function VerdictCard({ facts, done, actions }: VerdictCardProps) {
  const results = evaluate(facts);
  const final = done ? verdict(results) : undefined;
  const why = final ? whyList(facts, results) : [];
  const risk = results.filter((r) => r.status === 'fired' && r.weight > 0);
  const legit = results.filter((r) => r.status === 'fired' && r.weight < 0);
  const checking = results.filter((r) => !done && isAwaitingLookup(r, facts));
  const unknown = results.filter((r) => r.status === 'unknown' && !checking.includes(r));
  const notFired = results.filter(
    (r) =>
      r.status === 'not-fired' ||
      r.status === 'not-applicable' ||
      (r.status === 'fired' && r.weight === 0),
  );

  return (
    <CardFrame announcement={final && announce(final, why)}>
      {final ? (
        <>
          <VerdictHeader v={final} text={summary(final, facts)} />
          {why.length > 0 && <WhyList items={why} />}
        </>
      ) : (
        <p className="animate-pulse text-zinc-400">Verdict: still checking…</p>
      )}
      {risk.length > 0 && <RuleList title="Risk signals fired" rules={risk} />}
      {legit.length > 0 && <RuleList title="Legit signals fired" rules={legit} />}
      {checking.length > 0 && <RuleList title="Still checking" rules={checking} pending />}
      {unknown.length > 0 && <RuleList title="Couldn't check" rules={unknown} />}
      {notFired.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-400">
            Not fired or not applicable ({notFired.length})
          </summary>
          <RuleList title="Not fired" rules={notFired} />
        </details>
      )}
      {final && actions}
    </CardFrame>
  );
}

/** For a known official domain: no lookups or scoring, just the verdict. */
export function OfficialVerdictCard({
  domain,
  orgName,
  brandTld,
  actions,
}: {
  domain: string;
  orgName: string;
  /** Set when official because the org operates the domain's TLD (punycode). */
  brandTld?: string;
  actions?: ReactNode;
}) {
  const v: Verdict = { verdict: 'Official', score: 0, unknownShare: 0 };
  return (
    <CardFrame announcement="Verdict: Official">
      <VerdictHeader v={v} text={officialExplanation(domain, orgName, brandTld)} />
      {actions}
    </CardFrame>
  );
}

/** The card's region; `announcement` goes to a polite live region for screen readers. */
function CardFrame({ announcement, children }: { announcement?: string; children: ReactNode }) {
  return (
    <section
      aria-label="Verdict"
      className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-black/60 p-4 font-mono text-sm"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {children}
    </section>
  );
}
