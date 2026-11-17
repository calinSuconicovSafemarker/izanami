import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InvalidVariantError, parseVariant, similarity, type ParsedVariant } from '../domain';
import type { LookupClient } from '../lookup';
import type { Org } from '../orgs';
import { toOrgInput } from '../orgs';
import { gatherFacts, type Existence, type Fact, type Facts } from '../rules';
import { useLookupClient } from './client-context';
import { tapLookups, type TerminalLine } from './lines';

/**
 * State of the lookup for the variant last submitted.
 * - `idle`      nothing submitted yet
 * - `invalid`   input could not be parsed as a domain
 * - `official`  the variant is one of the organisation's known official domains; no lookups run
 * - `running`   lookups in flight; `facts` is the latest progressive snapshot
 * - `done`      every lookup settled; `facts` is final (safe to call `verdict()`)
 */
export type LookupState =
  | { phase: 'idle' }
  | { phase: 'invalid'; input: string; message: string }
  | { phase: 'official'; variant: ParsedVariant }
  | {
      phase: 'running' | 'done';
      variant: ParsedVariant;
      /** Raw DNS/RDAP results for the variant, in arrival order. */
      lines: TerminalLine[];
      /** Latest `gatherFacts` snapshot (pending facts while running). */
      facts: Facts;
      /** Shortcut for `facts.variantFacts.existence`. */
      existence: Fact<Existence>;
    };

export interface Lookup {
  state: LookupState;
  /** Parse and look up `input`. Starting a new run abandons the previous one. */
  run: (input: string) => void;
}

/** Drives one organisation's lookup terminal: parse → official check → gatherFacts with progress. */
export function useLookup(org: Org, clientOverride?: LookupClient): Lookup {
  const contextClient = useLookupClient();
  const client = clientOverride ?? contextClient;
  const orgInput = useMemo(() => toOrgInput(org), [org]);
  const [state, setState] = useState<LookupState>({ phase: 'idle' });
  const runId = useRef(0);

  const run = useCallback(
    (input: string) => {
      const id = ++runId.current;
      const current = () => id === runId.current;
      let variant: ParsedVariant;
      try {
        variant = parseVariant(input);
      } catch (e) {
        if (!(e instanceof InvalidVariantError)) throw e;
        setState({ phase: 'invalid', input, message: e.message });
        return;
      }
      if (similarity(variant, orgInput.brandLabel, orgInput.officialDomains).isOfficial) {
        setState({ phase: 'official', variant });
        return;
      }

      let lines: TerminalLine[] = [];
      let facts: Facts | undefined;
      const publish = (phase: 'running' | 'done') => {
        if (!current() || !facts) return;
        setState({ phase, variant, lines, facts, existence: facts.variantFacts.existence });
      };
      const tapped = tapLookups(client, variant.registrableDomain, (line) => {
        lines = [...lines, line];
        publish('running');
      });
      void gatherFacts(variant, orgInput, tapped, {
        onProgress: (f) => {
          facts = f;
          publish('running');
        },
      }).then((f) => {
        facts = f;
        publish('done');
      });
    },
    [client, orgInput],
  );

  // Abandon in-flight runs on unmount.
  useEffect(() => () => void ++runId.current, []);

  return { state, run };
}
