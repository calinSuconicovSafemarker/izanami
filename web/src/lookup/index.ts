import { LiveLookupClient, type LiveLookupClientOptions } from './live-client';
import { withSessionCache } from './session-cache';
import type { LookupClient } from './types';

export type * from './types';
export { LiveLookupClient, RDAP_FALLBACK_BASE_URL } from './live-client';
export type { LiveLookupClientOptions } from './live-client';
export { withSessionCache } from './session-cache';

/** The client the app uses: live network lookups behind a per-session cache. */
export function createLookupClient(options: LiveLookupClientOptions = {}): LookupClient {
  return withSessionCache(new LiveLookupClient(options));
}
