import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests (`npm test`): pure and server logic in src/, with Supabase and
// fetch mocked. No network, no database. The database tests (Row Level
// Security on a real Postgres) live in tests/db and run with `npm run test:db`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
