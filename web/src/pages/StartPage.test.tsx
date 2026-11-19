import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render-route';

describe('start page', () => {
  it('shows the IZANAMI wordmark as the page heading', () => {
    renderRoute('/');
    expect(screen.getByRole('heading', { level: 1, name: 'IZANAMI' })).toBeInTheDocument();
  });

  it('opens the organisation list from the start button', () => {
    const router = renderRoute('/');
    fireEvent.click(screen.getByRole('link', { name: /start analysis/i }));
    expect(router.state.location.pathname).toBe('/orgs');
  });

  it('states the intended use and that results are heuristics', () => {
    renderRoute('/');
    expect(screen.getByRole('complementary', { name: /intended use/i })).toHaveTextContent(
      /heuristics, not proof/i,
    );
  });
});
