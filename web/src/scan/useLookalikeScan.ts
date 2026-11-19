import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generatePermutations, parseVariant, type Candidate } from '../domain';
import type { LookupClient } from '../lookup';
import { useLookupClient } from '../lookup-ui/client-context';
import { officialContext, type Org } from '../orgs';
import { ccTld, quickPickTlds, rateTld, type TldRating } from '../tld';
import { scanCandidates, type ScanResult } from './scan';

/** Extra TLDs scanned besides the quick-pick chips: popular ccTLDs/gTLDs and abuse-heavy ones. */
const EXTRA_SCAN_TLDS = [
  'co',
  'io',
  'app',
  'biz',
  'eu',
  'de',
  'fr',
  'uk',
  'us',
  'me',
  'site',
  'live',
  'click',
  'support',
] as const;

export interface ScanRow extends ScanResult {
  rating: TldRating;
  /** When the result settled (ISO 8601). */
  checkedAt: string;
}

export type ScanState =
  | { phase: 'idle' }
  | {
      phase: 'running' | 'done' | 'cancelled';
      total: number;
      /** Settled rows in candidate order. */
      rows: ScanRow[];
    };

export interface LookalikeScanOptions {
  /** Pause between queries per worker; default from `scanCandidates`. */
  delayMs?: number;
  client?: LookupClient;
}

export interface LookalikeScanHook {
  state: ScanState;
  candidates: readonly Candidate[];
  start: () => void;
  cancel: () => void;
}

/** The bounded candidate set for an org (brand × TLDs plus typos on the primary TLD). */
export function lookalikeCandidates(org: Org): Candidate[] {
  const ctx = officialContext(org);
  const tlds = [
    ...new Set([
      ...(org.country ? [ccTld(org.country)] : []),
      ...quickPickTlds(org).map((r) => r.tld),
      ...EXTRA_SCAN_TLDS,
    ]),
  ];
  return generatePermutations({
    brandLabel: ctx.brandLabel,
    primaryTld: parseVariant(org.primaryDomain).tld,
    tlds,
    // Every related domain, Wikidata-listed ones included, is the org's or was: never report it
    // as a lookalike to register.
    officialDomains: [...ctx.officialDomains, ...ctx.relatedOwned.map((r) => r.domain)],
  });
}

/** Runs the lookalike scan for one org; cancel or unmount stops dispatching queries. */
export function useLookalikeScan(org: Org, options: LookalikeScanOptions = {}): LookalikeScanHook {
  const { delayMs } = options;
  const contextClient = useLookupClient();
  const client = options.client ?? contextClient;
  const candidates = useMemo(() => lookalikeCandidates(org), [org]);
  const [state, setState] = useState<ScanState>({ phase: 'idle' });
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (!controller.current) return;
    controller.current.abort();
    controller.current = null;
    setState((s) => (s.phase === 'running' ? { ...s, phase: 'cancelled' } : s));
  }, []);

  const start = useCallback(() => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    // Only brand TLDs rate as `official` here: a typo on the org's own .com must not.
    const ctx = { brandTlds: officialContext(org).brandTlds };
    const settled: (ScanRow | undefined)[] = [];
    const rows = () => settled.filter((r): r is ScanRow => r !== undefined);
    setState({ phase: 'running', total: candidates.length, rows: [] });
    void scanCandidates(candidates, client, {
      delayMs,
      signal: ac.signal,
      onResult: (result, index) => {
        settled[index] = {
          ...result,
          rating: rateTld(result.candidate.tld, ctx),
          checkedAt: new Date().toISOString(),
        };
        setState({ phase: 'running', total: candidates.length, rows: rows() });
      },
    }).then(() => {
      if (ac.signal.aborted) return;
      controller.current = null;
      setState({ phase: 'done', total: candidates.length, rows: rows() });
    });
  }, [candidates, client, delayMs, org]);

  useEffect(() => () => controller.current?.abort(), []);

  return { state, candidates, start, cancel };
}
