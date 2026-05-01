import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // [SPEC 8 v0.5.1 B2.3] Use the React 17+ automatic JSX runtime so component
  // tests (e.g. TodoBlockView.test.tsx) don't need to import React. Next.js
  // already uses automatic in production; this just brings vitest's esbuild
  // transform in line with that. Without it, the components fail at render
  // time with `ReferenceError: React is not defined` because vitest's default
  // is the classic runtime.
  esbuild: {
    jsx: 'automatic',
  },
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
