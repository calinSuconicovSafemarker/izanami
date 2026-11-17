import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render-route';

describe('landing page', () => {
  it('shows TU Delft when searching "delft" and opens its page on click', () => {
    const router = renderRoute('/');
    fireEvent.change(screen.getByRole('searchbox', { name: /search organisations/i }), {
      target: { value: 'delft' },
    });
    const results = screen.getByRole('list', { name: /organisations/i });
    const link = within(results).getByRole('link', { name: /delft university of technology/i });
    fireEvent.click(link);
    expect(router.state.location.pathname).toBe('/org/tu-delft');
  });

  it('filters by domain and hides non-matching organisations', () => {
    renderRoute('/');
    fireEvent.change(screen.getByRole('searchbox', { name: /search organisations/i }), {
      target: { value: 'tudelft.nl' },
    });
    const results = screen.getByRole('list', { name: /organisations/i });
    expect(within(results).getAllByRole('link')).toHaveLength(1);
  });

  it('says so when nothing matches', () => {
    renderRoute('/');
    fireEvent.change(screen.getByRole('searchbox', { name: /search organisations/i }), {
      target: { value: 'zzzz-no-such-org' },
    });
    expect(screen.getByText(/no organisation matches/i)).toBeInTheDocument();
  });

  it('focuses the search box when "/" is pressed', () => {
    renderRoute('/');
    const search = screen.getByRole('searchbox', { name: /search organisations/i });
    search.blur();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(search).toHaveFocus();
  });

  it('opens the first result when Enter is pressed in the search box', () => {
    const router = renderRoute('/');
    const search = screen.getByRole('searchbox', { name: /search organisations/i });
    fireEvent.change(search, { target: { value: 'delft' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(router.state.location.pathname).toBe('/org/tu-delft');
  });
});
