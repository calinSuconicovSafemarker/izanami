import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cspMeta } from './csp-meta-plugin';

// CSP (ADR-0004): script-src 'self'; style-src 'self'.
// The production build must not emit inline <script> bodies or style= attributes:
// - CSS is always extracted to files (cssCodeSplit, no style injection).
// - assetsInlineLimit 0 keeps assets as files rather than data: URIs in JS/CSS.
// - modulePreload polyfill disabled so nothing is injected into index.html.
// Hosting (ADR-0005): GitHub Pages serves the site under /izanami/, so asset URLs are relative
// (base './'; hash routing needs no rewrites) and the CSP is injected as a <meta> tag.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), cspMeta()],
  build: {
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Live network tests run only via `npm run test:live`.
    exclude: [...configDefaults.exclude, '**/*.live.test.ts'],
  },
});
