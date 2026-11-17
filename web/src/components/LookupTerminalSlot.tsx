import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Org } from '../orgs';
import { LookupTerminal } from '../lookup-ui/LookupTerminal';
import { useLookup, type LookupState } from '../lookup-ui/useLookup';
import { OfficialVerdictCard, VerdictCard } from '../verdict-ui';
import { isNotRegistered } from '../rules';

/**
 * The org page's lookup area. Owns the lookup state (`useLookup`) and syncs it with the
 * `?d=<variant>` deep link: the URL is the source of truth, so opening a link auto-runs
 * and submitting updates the URL. The verdict card renders below the terminal from `lookup.state`.
 */
export function LookupTerminalSlot({ org }: { org: Org }) {
  const lookup = useLookup(org);
  const { run } = lookup;
  const [params, setParams] = useSearchParams();
  const d = params.get('d');

  useEffect(() => {
    if (d) run(d);
  }, [d, run]);

  const submit = (input: string) => {
    if (input === d) run(input);
    else setParams({ d: input });
  };

  // Keyed on the deep link so a changed `?d=` re-prefills the input.
  return (
    <div className="flex flex-col gap-4">
      <LookupTerminal key={d ?? ''} org={org} lookup={lookup} initialInput={d} onSubmit={submit} />
      <Verdict state={lookup.state} orgName={org.name} />
    </div>
  );
}

function Verdict({ state, orgName }: { state: LookupState; orgName: string }) {
  switch (state.phase) {
    case 'official':
      return <OfficialVerdictCard domain={state.variant.unicode} orgName={orgName} />;
    case 'running':
    case 'done': {
      // An unregistered variant gets the terminal's "no active threat" line instead of a verdict.
      if (isNotRegistered(state.existence)) return null;
      return <VerdictCard facts={state.facts} done={state.phase === 'done'} />;
    }
    default:
      return null;
  }
}
