import { fireEvent, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { renderRoute } from './test/render-route';

// jsdom has no layout and no Tailwind CSS, so axe's colour-contrast rule cannot run here. The
// static check below stands in for it: on the dark theme (zinc-950/900 and bg-black/60
// surfaces) text must be zinc-400 or lighter (zinc-400 on zinc-900 ≈ 7:1; zinc-500 ≈ 4:1 fails AA).
async function violations() {
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

describe('accessibility (axe)', () => {
  it.each(['/', '/orgs', '/org/tu-delft', '/org/google', '/credits', '/nope'])(
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

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

describe('colour contrast (static)', () => {
  it('uses no text colour darker than zinc-400 on the dark theme', () => {
    const lowContrast = Object.entries(sources).flatMap(([file, src]) =>
      [
        ...src.matchAll(
          /(?:^|[\s"'`:])((?:placeholder:)?text-(?:zinc|gray|neutral|slate)-(?:[5-9]00|950))\b/g,
        ),
      ].map((m) => `${file}: ${m[1]}`),
    );
    expect(lowContrast).toEqual([]);
  });
});
