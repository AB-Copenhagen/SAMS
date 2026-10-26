import { defineConfig } from 'vitest/config';

// lib/db.ts constructs a PrismaClient at module-import time (not lazily), so any test that
// transitively imports it -- even one that never actually queries the DB, like a pure-function
// unit test -- needs this set just to avoid an import-time throw. The adapter/client themselves
// don't connect until a real query runs, so a non-functional placeholder URL is enough.
export default defineConfig({
  test: {
    env: {
      TURSO_DATABASE_URL: 'libsql://test.invalid',
    },
  },
});
