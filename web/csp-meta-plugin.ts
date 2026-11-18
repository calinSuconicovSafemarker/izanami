import type { Plugin } from 'vite';
import { buildCsp } from '../infra/lib/csp';
import rdapHosts from './src/data/rdap-hosts.json' with { type: 'json' };

/**
 * Injects the CSP as a <meta http-equiv> tag into the production index.html (ADR-0005).
 * GitHub Pages cannot set response headers, so this is how the policy reaches the browser.
 * Dev builds are left alone so Vite's HMR (which uses inline scripts/websockets) keeps working.
 */
export function cspMeta(): Plugin {
  const csp = buildCsp(rdapHosts.hosts, { forMeta: true });
  return {
    name: 'izanami-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}
