// One lookup, start to finish: parse → official check → gather facts. Shared by the website's
// lookup terminal (useLookup) and the JSON API (api/), so both give the same result.
// Pure orchestration: no React, no DOM; network only through the injected LookupClient.
import {
  InvalidVariantError,
  parseVariant,
  similarity,
  type ParsedVariant,
  type Similarity,
} from '../domain';
import type { LookupClient } from '../lookup';
import { gatherFacts, type Facts, type GatherOptions, type OrgInput } from '../rules';

/**
 * - `invalid`   input could not be parsed as a domain; nothing was looked up
 * - `official`  one of the org's known official domains (or under its brand TLD); no lookups run
 * - `lookup`    lookups started; `facts` settles with the final facts (it never rejects)
 */
export type Check =
  | { phase: 'invalid'; input: string; message: string }
  | {
      phase: 'official';
      variant: ParsedVariant;
      /** Why it is official (reused by the export). */
      similarity: Similarity;
      /** Set when official because the org operates the variant's TLD (punycode). */
      brandTld?: string;
    }
  | { phase: 'lookup'; variant: ParsedVariant; facts: Promise<Facts> };

export interface CheckOptions extends GatherOptions {
  /** Wrap the client for this variant's lookups (the terminal taps raw results as they arrive). */
  clientFor?: (variant: ParsedVariant, client: LookupClient) => LookupClient;
}

/**
 * Start checking `input` against an organisation. Parsing and the official check are
 * synchronous, so a caller can show `invalid` / `official` at once; lookups run in `facts`.
 */
export function startCheck(
  input: string,
  org: OrgInput,
  client: LookupClient,
  options: CheckOptions = {},
): Check {
  let variant: ParsedVariant;
  try {
    variant = parseVariant(input);
  } catch (e) {
    if (!(e instanceof InvalidVariantError)) throw e;
    return { phase: 'invalid', input, message: e.message };
  }
  const sim = similarity(variant, org.brandLabel, org.officialDomains, org.brandTlds);
  if (sim.isOfficial) {
    return {
      phase: 'official',
      variant,
      similarity: sim,
      ...(sim.brandTld ? { brandTld: sim.brandTld } : {}),
    };
  }
  const { clientFor, ...gather } = options;
  const lookups = clientFor ? clientFor(variant, client) : client;
  return { phase: 'lookup', variant, facts: gatherFacts(variant, org, lookups, gather) };
}
