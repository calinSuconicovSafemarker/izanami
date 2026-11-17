import { createContext, useContext } from 'react';
import rdapHostsJson from '../data/rdap-hosts.json';
import { createLookupClient, type LookupClient } from '../lookup';

let liveClient: LookupClient | undefined;

/** The app's live client, created on first use (one session cache for the whole app). */
function defaultClient(): LookupClient {
  return (liveClient ??= createLookupClient({ rdapBaseUrls: rdapHostsJson.servers }));
}

export const LookupClientContext = createContext<LookupClient | null>(null);

/** The provided LookupClient, or the live one when no provider is present. */
export function useLookupClient(): LookupClient {
  return useContext(LookupClientContext) ?? defaultClient();
}
