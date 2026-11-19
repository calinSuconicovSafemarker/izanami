import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CREDITS, SOFTWARE } from '../credits/sources';
import { renderRoute } from '../test/render-route';

describe('credits page', () => {
  it('is linked from the footer of every page', () => {
    const router = renderRoute('/org/tu-delft');
    fireEvent.click(screen.getByRole('link', { name: /credits and licences/i }));
    expect(router.state.location.pathname).toBe('/credits');
    expect(screen.getByRole('heading', { level: 1, name: /credits and licences/i })).toBeVisible();
  });

  it.each([
    [
      'Data used to build the org list',
      ['Wikidata', 'Majestic Million', 'Chrome UX Report', 'Unicode confusables'],
    ],
    ['Live lookups', ['Cloudflare DNS over HTTPS', 'Team Cymru', 'crt.sh', 'rdap.org']],
    ['Software', ['React', 'tldts']],
  ])('groups "%s" with its entries', (title, names) => {
    renderRoute('/credits');
    const section = screen.getByRole('region', { name: title });
    for (const name of names)
      expect(within(section).getAllByRole('link', { name: new RegExp(name) })[0]).toBeVisible();
  });

  it('links every source and its licence, opening in a new tab without a referrer', () => {
    renderRoute('/credits');
    for (const c of [...CREDITS, ...SOFTWARE]) {
      const [first] = screen.getAllByRole('link', { name: c.name });
      expect(first).toHaveAttribute('href', c.url);
      expect(first).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('shows required attribution and the Unicode licence notice verbatim', () => {
    renderRoute('/credits');
    expect(
      screen.getByText('Copyright © 1991-2026 Unicode, Inc. Unicode License V3.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/this copyright and permission notice appear/)).toBeInTheDocument();
  });

  it('says sources do not endorse Izanami and credits both popularity lists under CC BY', () => {
    renderRoute('/credits');
    expect(screen.getByText(/none of these sources endorses izanami/i)).toBeVisible();
    expect(screen.getByText(/^The Majestic Million by Majestic .*CC BY 3\.0/)).toBeVisible();
    expect(screen.getByText(/^Chrome UX Report \(CrUX\) by Google .*CC BY 4\.0/)).toBeVisible();
    expect(screen.getByText(/states no licence of its own/)).toBeVisible();
  });
});
