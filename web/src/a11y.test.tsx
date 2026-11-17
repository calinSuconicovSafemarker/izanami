import { fireEvent, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { renderRoute } from './test/render-route';

// jsdom has no layout, so colour-contrast can't be computed here; contrast is checked by hand
// (Tailwind zinc-400 or lighter on zinc-950/900 is >= 4.5:1).
async function violations() {
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

describe('accessibility (axe)', () => {
  it.each(['/', '/org/tu-delft', '/org/google-search', '/nope'])(
    '%s has no violations',
    async (path) => {
      renderRoute(path);
      expect(await violations()).toEqual([]);
    },
  );

  it('the privacy dialog has no violations', async () => {
    renderRoute('/org/tu-delft');
    fireEvent.click(screen.getByRole('button', { name: /what this tool sends where/i }));
    expect(await violations()).toEqual([]);
  });

  it('every page offers a skip link to the main content', () => {
    renderRoute('/org/tu-delft');
    fireEvent.click(screen.getByRole('link', { name: /skip to content/i }));
    expect(document.activeElement).toContainElement(screen.getByRole('main'));
  });
});
