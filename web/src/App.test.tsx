import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { isFramed } from './lib/framing';

describe('App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the start page at the root hash route', () => {
    window.location.hash = '#/';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /izanami/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start analysis/i })).toBeInTheDocument();
  });

  it('does not render the app inside a frame (ticket 23)', () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    render(<App />);
    expect(screen.queryByRole('link', { name: /start analysis/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open izanami directly/i })).toHaveAttribute(
      'target',
      '_top',
    );
  });

  it('treats an unreadable cross-origin top as framed', () => {
    const win = {
      self: {},
      get top(): Window {
        throw new DOMException('Blocked', 'SecurityError');
      },
    } as unknown as Window;
    expect(isFramed(win)).toBe(true);
    expect(isFramed(window)).toBe(false);
  });
});
