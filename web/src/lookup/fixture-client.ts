import { LiveLookupClient } from './live-client';
import type { FetchLike, RdapBaseUrls } from './types';

/** A recorded HTTP response. `json` when the body parsed as JSON, otherwise `text`. */
export interface RecordedResponse {
  status: number;
  json?: unknown;
  text?: string;
}

export interface Fixture {
  description: string;
  recordedAt: string;
  /** Request URL → recorded response. */
  responses: Record<string, RecordedResponse>;
}

const modules = import.meta.glob<Fixture>('./fixtures/*.json', { eager: true, import: 'default' });

export const FIXTURES: Record<string, Fixture> = Object.fromEntries(
  Object.entries(modules).map(([path, fixture]) => [
    path.replace(/^\.\/fixtures\//, '').replace(/\.json$/, ''),
    fixture,
  ]),
);

/** Replays recorded responses; unknown URLs fail like a network error. */
export function fixtureFetch(fixtures: Fixture[]): FetchLike {
  const responses = new Map<string, RecordedResponse>();
  for (const f of fixtures)
    for (const [url, r] of Object.entries(f.responses)) responses.set(url, r);
  return async (input) => {
    const r = responses.get(input);
    if (!r) throw new TypeError(`Failed to fetch (no fixture for ${input})`);
    const body = r.json !== undefined ? JSON.stringify(r.json) : (r.text ?? '');
    return new Response(body, { status: r.status });
  };
}

/** The RDAP servers the fixtures were recorded against; other TLDs replay via rdap.org. */
export const FIXTURE_RDAP_BASE_URLS: RdapBaseUrls = {
  nl: 'https://rdap.sidn.nl/',
  com: 'https://rdap.verisign.com/com/v1/',
};

/**
 * Offline LookupClient for tests and demos: the live client wired to replay
 * recorded responses. Pass fixture names (file names without `.json`) to
 * restrict which recordings are available; default is all of them.
 */
export class FixtureLookupClient extends LiveLookupClient {
  constructor(names: string[] = Object.keys(FIXTURES)) {
    const fixtures = names.map((n) => {
      const f = FIXTURES[n];
      if (!f) throw new Error(`Unknown fixture: ${n}`);
      return f;
    });
    super({ fetch: fixtureFetch(fixtures), rdapBaseUrls: FIXTURE_RDAP_BASE_URLS });
  }
}
