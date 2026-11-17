import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render-route';

const card = () => screen.getByRole('region', { name: /official domains/i });

describe('organisation page', () => {
  it('shows the name, primary domain and other official domains', () => {
    renderRoute('/org/google-search');
    expect(screen.getByRole('heading', { level: 1, name: 'Google Search' })).toBeInTheDocument();
    expect(within(card()).getByText('google.com', { selector: '[data-primary]' })).toBeVisible();
    const others = within(card()).getByRole('list', { name: /other known official domains/i });
    expect(within(others).getByText('google.nl')).toBeInTheDocument();
    expect(within(others).queryByText('google.com')).not.toBeInTheDocument();
  });

  it('cites Wikidata P856 with a link to the item, the Tranco rank and the confirmation date', () => {
    renderRoute('/org/google-search');
    const evidence = within(card()).getByRole('list', { name: /evidence/i });
    const wikidata = within(evidence).getByRole('link', { name: /wikidata/i });
    expect(wikidata).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q9366');
    expect(evidence).toHaveTextContent('Wikidata lists this as the official website (P856)');
    expect(evidence).toHaveTextContent('Tranco rank 1 — heavily used');
    expect(evidence).toHaveTextContent('Confirmed at 2026-11-17');
  });

  it('marks curated extras with their source instead of the Wikidata P856 line', () => {
    renderRoute('/org/tu-delft');
    const evidence = within(card()).getByRole('list', { name: /evidence/i });
    expect(evidence).toHaveTextContent('Curated entry — source:');
    expect(evidence).not.toHaveTextContent('(P856)');
    expect(within(evidence).getByRole('link')).toHaveAttribute(
      'href',
      'https://www.wikidata.org/wiki/Q752663',
    );
    expect(evidence).toHaveTextContent('Tranco rank 5,404 — heavily used');
  });

  it('carries the disclaimer in the page content', () => {
    renderRoute('/org/tu-delft');
    expect(screen.getByRole('main')).toHaveTextContent(
      'Heuristic, not a guarantee. Passive public lookups only.',
    );
  });

  it('never claims proof of ownership', () => {
    renderRoute('/org/tu-delft');
    expect(document.body).not.toHaveTextContent(/proven|verified owner/i);
  });

  it('shows the lookup terminal prefilled with the brand label', () => {
    renderRoute('/org/tu-delft');
    const slot = screen.getByRole('region', { name: /lookup terminal/i });
    expect(within(slot).getByRole('textbox', { name: /domain to check/i })).toHaveValue('tudelft.');
  });

  it('shows a friendly 404 with a link home for an unknown slug', () => {
    const router = renderRoute('/org/no-such-org');
    expect(screen.getByRole('heading', { level: 1, name: /not found/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /all organisations/i }));
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows the same 404 for an unknown route', () => {
    renderRoute('/nope');
    expect(screen.getByRole('heading', { level: 1, name: /not found/i })).toBeInTheDocument();
  });
});
