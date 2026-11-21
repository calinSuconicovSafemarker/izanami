import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as download from '../export/download';
import { renderRoute } from '../test/render-route';

describe('landing page', () => {
  it('shows TU Delft when searching "delft" and opens its page on click', () => {
    const router = renderRoute('/orgs');
    fireEvent.change(screen.getByRole('searchbox', { name: /search organisations/i }), {
      target: { value: 'delft' },
    });
    const results = screen.getByRole('list', { name: /organisations/i });
    const link = within(results).getByRole('link', { name: /delft university of technology/i });
    fireEvent.click(link);
    expect(router.state.location.pathname).toBe('/org/tu-delft');
  });

  it('filters by domain and hides non-matching organisations', () => {
    renderRoute('/orgs');
    fireEvent.change(screen.getByRole('searchbox', { name: /search organisations/i }), {
      target: { value: 'tudelft.nl' },
    });
    const results = screen.getByRole('list', { name: /organisations/i });
    expect(within(results).getAllByRole('link')).toHaveLength(1);
  });

  it('says so when nothing matches', () => {
    renderRoute('/orgs');
    fireEvent.change(screen.getByRole('searchbox', { name: /search organisations/i }), {
      target: { value: 'zzzz-no-such-org' },
    });
    expect(screen.getByText(/no organisation matches/i)).toBeInTheDocument();
  });

  it('focuses the search box when "/" is pressed', () => {
    renderRoute('/orgs');
    const search = screen.getByRole('searchbox', { name: /search organisations/i });
    search.blur();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(search).toHaveFocus();
  });

  it('opens the first result when Enter is pressed in the search box', () => {
    const router = renderRoute('/orgs');
    const search = screen.getByRole('searchbox', { name: /search organisations/i });
    fireEvent.change(search, { target: { value: 'delft' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(router.state.location.pathname).toBe('/org/tu-delft');
  });

  it('downloads every organisation’s domains as one CSV', () => {
    const save = vi.spyOn(download, 'downloadCsv').mockImplementation(() => {});
    renderRoute('/orgs');
    fireEvent.click(screen.getByRole('button', { name: /download all domains/i }));
    expect(save).toHaveBeenCalledTimes(1);
    const [filename, csv] = save.mock.calls[0]!;
    expect(filename).toMatch(/^izanami-all-domains-\d{8}-\d{4}\.csv$/);
    expect(csv.split('\r\n')[0]).toBe(
      'organisation,org_id,wikidata_id,country,primary_domain,domain,relationship,trust,evidence',
    );
    expect(csv).toContain('Google,google,');
    save.mockRestore();
  });
});
