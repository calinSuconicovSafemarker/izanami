import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist', '**/coverage', '**/node_modules', 'infra/cdk.out', 'docs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['scripts/**/*.ts', 'infra/**/*.ts', 'api/**/*.ts', '*.js', 'web/*.{ts,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Rules engine stays pure: no network, DOM or storage. Lookups only reach it
    // through the injected LookupClient (type imports allowed).
    files: ['web/src/rules/**/*.ts'],
    ignores: ['web/src/rules/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'fetch',
          'window',
          'document',
          'navigator',
          'location',
          'XMLHttpRequest',
          'WebSocket',
          'localStorage',
          'sessionStorage',
          'indexedDB',
        ].map((name) => ({ name, message: 'Rules must not access the network or DOM.' })),
      ],
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-dom', 'react-router-dom'].map((name) => ({
            name,
            message: 'Rules must not depend on the UI.',
          })),
          patterns: [
            {
              group: ['**/lookup', '**/lookup/*'],
              allowTypeImports: true,
              message: 'Rules may only use LookupClient types; the client is injected.',
            },
          ],
        },
      ],
    },
  },
  {
    // Rule functions and the verdict are deterministic: ages come from facts.checkedAt.
    files: ['web/src/rules/{rules,verdict,evaluate}.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.name='Date'][arguments.length=0], CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Rules must not read the clock; use checkedAt.',
        },
      ],
    },
  },
  prettier,
);
