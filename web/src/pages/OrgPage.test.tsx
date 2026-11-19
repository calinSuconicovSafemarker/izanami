import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FixtureLookupClient } from '../lookup/fixture-client';
import { getOrg } from '../orgs';
import { renderRoute } from '../test/render-route';

const card = () => screen.getByRole('region', { name: /official domains/i });

describe('organisation page', () => {
  it('shows the name, primary domain and other official domains', () => {
    renderRoute('/org/google');
    expect(screen.getByRole('heading', { level: 1, name: 'Google' })).toBeInTheDocument();
    expect(within(card()).getByText('google.com', { selector: '[data-primary]' })).toBeVisible();
    const others = within(card()).getByRole('list', { name: /own sites/i });
    expect(within(others).getByText('google.nl')).toBeInTheDocument();
    expect(within(others).queryByText('google.com')).not.toBeInTheDocument();
  });

  it('lists related domains grouped by trust level, each with its source (R1)', () => {
    renderRoute('/org/google');
    const curated = within(card()).getByRole('list', { name: /official \(curated/i });
    const youtube = within(curated).getByText('youtube.com').closest('li')!;
    expect(within(youtube).getByRole('link')).toHaveAttribute(
      'href',
      'https://knowledge.workspace.google.com/admin/youtube/control-youtube-content-available-to-users',
    );
    expect(within(curated).getByText('g.co').closest('li')).toHaveTextContent(/source/i);
    expect(
      within(card()).getByRole('list', { name: /official \(published by google\)/i }),
    ).toBeInTheDocument();
    const listed = within(card()).getByRole('list', { name: /owned per wikidata/i });
    expect(listed).toHaveTextContent(/Wikidata: /);
    expect(card()).toHaveTextContent(/still looked up and scored/i);
  });

  it('lists the brand TLDs the org operates, each linked to its IANA record', () => {
    renderRoute('/org/google');
    const tlds = within(card()).getByRole('list', { name: /operates the tlds/i });
    expect(card()).toHaveTextContent(/Operates the TLDs/);
    const gle = within(tlds).getByRole('link', { name: '.gle' });
    expect(gle).toHaveAttribute('href', 'https://www.iana.org/domains/root/db/gle.html');
    expect(within(tlds).getByRole('link', { name: '.google' })).toBeInTheDocument();
    expect(within(tlds).getByRole('link', { name: '.youtube' })).toBeInTheDocument();
    // IDN TLDs are shown in Unicode (xn--flw351e).
    expect(within(tlds).getByRole('link', { name: '.谷歌' })).toBeInTheDocument();
  });

  it('shows no brand TLDs for an org without any', () => {
    renderRoute('/org/tu-delft');
    expect(within(card()).queryByRole('list', { name: /operates the tlds/i })).toBeNull();
  });

  it('collapses a long group behind a disclosure', () => {
    renderRoute('/org/google');
    const published = within(card()).getByRole('list', { name: /published by google/i });
    const details = published.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByText(/show all \d+/i)).toBeInTheDocument();
  });

  it('treats a curated related domain typed on the page as Official', async () => {
    renderRoute('/org/google?d=youtube.com', new FixtureLookupClient([]));
    const verdict = await screen.findByRole('region', { name: /^verdict$/i });
    expect(within(verdict).getByRole('status')).toHaveTextContent('Verdict: Official');
  });

  it('looks up and scores a Wikidata-listed related domain instead of calling it Official (R1)', async () => {
    const google = getOrg('google')!;
    const listed = google.relatedDomains.find(
      (r) => r.source === 'wikidata-owned' && r.domain.endsWith('.com'),
    )!;
    renderRoute(`/org/google?d=${listed.domain}`, new FixtureLookupClient([]));
    const verdict = await screen.findByRole('region', { name: /^verdict$/i });
    expect(await within(verdict).findByText(/Wikidata lists .* as owned by Google/)).toBeTruthy();
    expect(within(verdict).getByRole('status')).not.toHaveTextContent('Verdict: Official');
  });

  it('cites Wikidata P856 with a link to the item, the Tranco rank and the confirmation date', () => {
    renderRoute('/org/microsoft');
    const evidence = within(card()).getByRole('list', { name: /evidence/i });
    const wikidata = within(evidence).getByRole('link', { name: /wikidata/i });
    expect(wikidata).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q2283');
    expect(evidence).toHaveTextContent('Wikidata lists this as the official website (P856)');
    expect(evidence).toHaveTextContent('Tranco rank 8 — heavily used');
    expect(evidence).toHaveTextContent('Confirmed at 2026-11-19');
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
    expect(evidence).toHaveTextContent('Tranco rank 5,431 — heavily used');
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
