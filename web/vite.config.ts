import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// CSP (ADR-0004): script-src 'self'; style-src 'self'.
// The production build must not emit inline <script> bodies or style= attributes:
// - CSS is always extracted to files (cssCodeSplit, no style injection).
// - assetsInlineLimit 0 keeps assets as files rather than data: URIs in JS/CSS.
// - modulePreload polyfill disabled so nothing is injected into index.html.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
