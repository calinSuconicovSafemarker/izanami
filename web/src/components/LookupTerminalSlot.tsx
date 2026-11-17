import type { Org } from '../orgs';
import { toOrgInput } from '../orgs';

/**
 * Placeholder for the lookup terminal (ticket 06). Replace this component's body;
 * OrgPage already renders it with the organisation.
 */
export function LookupTerminalSlot({ org }: { org: Org }) {
  const { brandLabel } = toOrgInput(org);
  return (
    <section
      aria-labelledby="lookup-terminal-heading"
      className="rounded-lg border border-dashed border-zinc-700 bg-black/40 p-4 font-mono text-sm"
    >
      <h2
        id="lookup-terminal-heading"
        className="mb-2 text-xs uppercase tracking-wide text-zinc-500"
      >
        Lookup terminal
      </h2>
      <p className="break-all text-zinc-300">
        <span className="text-emerald-400">$ </span>
        {brandLabel}.<span className="animate-pulse text-zinc-500">▌</span>
      </p>
      <p className="mt-2 text-xs text-zinc-500">Domain lookups are coming soon.</p>
    </section>
  );
}
