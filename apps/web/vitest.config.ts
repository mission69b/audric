import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // `setupFiles` runs BEFORE every test file is loaded — this is
    // where we satisfy `lib/env.ts`'s required-env contract so module-
    // level imports of `env` don't throw at collection time. See
    // `vitest.setup.ts` for the placeholder values used.
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
