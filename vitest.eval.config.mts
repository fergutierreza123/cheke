import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// chekelin's eval (`npm run eval:chekelin`): simulated customers against the
// real model. Needs ANTHROPIC_API_KEY and costs money, so it is never part of
// `npm test`. See tests/eval/chekelin/chekelin.eval.ts.
//
// The key comes from the environment, else from .env.local (or the file
// named in EVAL_ENV_FILE). Only ANTHROPIC_API_KEY is read; it is never printed.
if (!process.env.ANTHROPIC_API_KEY) {
  const file = process.env.EVAL_ENV_FILE || ".env.local";
  if (existsSync(file)) {
    const match = /^ANTHROPIC_API_KEY=(.*)$/m.exec(readFileSync(file, "utf8"));
    if (match) process.env.ANTHROPIC_API_KEY = match[1].trim().replace(/^["']|["']$/g, "");
  }
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/eval/**/*.eval.ts"],
    environment: "node",
    testTimeout: 600_000,
    hookTimeout: 60_000,
    maxConcurrency: 6,
  },
});
