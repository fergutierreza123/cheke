import { defineConfig } from "vitest/config";

// Database tests (`npm run test:db`): every migration in supabase/migrations
// applied to an in-memory Postgres (PGlite: no Docker, no Supabase project),
// then Row Level Security checked as different people. See tests/README.md.
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
