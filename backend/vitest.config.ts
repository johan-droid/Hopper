import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Several suites share a single PostgreSQL instance (budget ledger, RLS,
    // migration and benchmark tests). Running files in parallel lets one file's
    // reset race another file's assertions, so files are serialized.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
