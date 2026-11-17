import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { LookupClient } from '../lookup';
import { FixtureLookupClient } from '../lookup/fixture-client';
import { LookupClientProvider } from '../lookup-ui/LookupClientContext';
import { routes } from '../routes';

/**
 * Render the app's real route tree at `path` (memory history instead of hash).
 * Lookups replay recorded fixtures unless another client is passed; tests never hit the network.
 */
export function renderRoute(path: string, client: LookupClient = new FixtureLookupClient()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <LookupClientProvider client={client}>
      <RouterProvider router={router} />
    </LookupClientProvider>,
  );
  return router;
}
