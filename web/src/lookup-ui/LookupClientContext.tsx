import type { ReactNode } from 'react';
import type { LookupClient } from '../lookup';
import { LookupClientContext } from './client-context';

/** Override the LookupClient for a subtree (tests pass a `FixtureLookupClient`). */
export function LookupClientProvider({
  client,
  children,
}: {
  client: LookupClient;
  children: ReactNode;
}) {
  return <LookupClientContext value={client}>{children}</LookupClientContext>;
}
