import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { DnsResult, DnsType } from '../lookup';
import { FixtureLookupClient } from '../lookup/fixture-client';
import { LookupClientProvider } from '../lookup-ui/LookupClientContext';
import { getOrg } from '../orgs';
import { renderRoute } from '../test/render-route';
import { LookalikeScan } from './LookalikeScan';

/** tudelft.net and tudelft.xyz are delegated; every other NS query is NXDOMAIN. */
class ScanClient extends FixtureLookupClient {
  queried: string[] = [];
  override async dns(name: string, type: DnsType): Promise<DnsResult> {
    this.queried.push(`${type} ${name}`);
    if (name === 'tudelft.net' || name === 'tudelft.xyz')
      return { status: 'ok', name, type, records: ['ns1.example.net'] };
    return { status: 'not-found', name, type, records: [] };
  }
}

/** Never answers, so the scan stays running until cancelled. */
class HangingClient extends FixtureLookupClient {
  queried = 0;
  override dns(): Promise<DnsResult> {
    this.queried++;
    return new Promise(() => {});
  }
}

function renderScan<C extends FixtureLookupClient>(client: C) {
  const org = getOrg('tu-delft')!;
  const router = createMemoryRouter(
    [{ path: '/org/:slug', element: <LookalikeScan org={org} delayMs={0} /> }],
    { initialEntries: ['/org/tu-delft'] },
  );
  render(
    <LookupClientProvider client={client}>
      <RouterProvider router={router} />
    </LookupClientProvider>,
  );
  return { router, client };
}

const scan = () => screen.getByRole('region', { name: /lookalike scan/i });
const rowFor = (domain: string) =>
  within(scan())
    .getAllByRole('row')
    .find((r) => r.querySelector('th')?.textContent === domain)!;

describe('lookalike scan', () => {
  it('is on the org page and says it only does passive DNS lookups', () => {
    renderRoute('/org/tu-delft');
    expect(scan()).toHaveTextContent(/passive DNS lookups only/i);
    expect(within(scan()).getByRole('button', { name: /scan lookalikes/i })).toBeEnabled();
  });

  it('lists candidates with technique, TLD rating and existence, using NS queries only', async () => {
    const { client } = renderScan(new ScanClient());
    fireEvent.click(within(scan()).getByRole('button', { name: /scan lookalikes/i }));
    expect(await within(scan()).findByText(/scan complete/i)).toBeInTheDocument();

    const com = rowFor('tudelft.net');
    expect(com).toHaveTextContent('TLD swap');
    expect(com).toHaveTextContent('generic');
    expect(com).toHaveTextContent('registered');
    expect(rowFor('tudelft.xyz')).toHaveTextContent('high-abuse');
    expect(rowFor('tudlft.nl')).toHaveTextContent('Omission');
    expect(rowFor('tudlft.nl')).not.toHaveTextContent(/omission/);
    expect(rowFor('tudlft.nl')).toHaveTextContent('not registered');
    expect(within(scan()).queryByText('tudelft.nl', { selector: 'th' })).not.toBeInTheDocument();

    expect(client.queried.length).toBeGreaterThan(0);
    expect(client.queried.length).toBeLessThanOrEqual(150);
    expect(client.queried.every((q) => q.startsWith('NS '))).toBe(true);
    expect(within(scan()).getByText(/2 registered/)).toBeInTheDocument();
  });

  it('links each candidate to the full lookup via ?d=', async () => {
    const { router } = renderScan(new ScanClient());
    fireEvent.click(within(scan()).getByRole('button', { name: /scan lookalikes/i }));
    await within(scan()).findByText(/scan complete/i);
    fireEvent.click(within(rowFor('tudelft.net')).getByRole('link', { name: /check/i }));
    expect(router.state.location.search).toBe('?d=tudelft.net');
  });

  it('can be cancelled while running', async () => {
    const { client } = renderScan(new HangingClient());
    fireEvent.click(within(scan()).getByRole('button', { name: /scan lookalikes/i }));
    const cancel = await within(scan()).findByRole('button', { name: /cancel/i });
    expect(client.queried).toBe(4);
    fireEvent.click(cancel);
    expect(await within(scan()).findByText(/scan cancelled/i)).toBeInTheDocument();
    expect(within(scan()).getByRole('button', { name: /scan lookalikes/i })).toBeEnabled();
  });
});
