import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Org } from '../orgs';
import { LookupTerminal } from '../lookup-ui/LookupTerminal';
import { useLookup } from '../lookup-ui/useLookup';

/**
 * The org page's lookup area. Owns the lookup state (`useLookup`) and syncs it with the
 * `?d=<variant>` deep link: the URL is the source of truth, so opening a link auto-runs
 * and submitting updates the URL. Ticket 08 renders its verdict card here from `lookup.state`.
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
    <LookupTerminal key={d ?? ''} org={org} lookup={lookup} initialInput={d} onSubmit={submit} />
  );
}
