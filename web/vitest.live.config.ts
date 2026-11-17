import { defineConfig } from 'vitest/config';

// Live network tests (`npm run test:live -w web`). Not part of `npm test` / CI.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.live.test.ts'],
    testTimeout: 15_000,
  },
});
