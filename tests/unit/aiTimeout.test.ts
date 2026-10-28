import { afterEach, describe, expect, it, vi } from "vitest";

// chekelin answers inside the webhook's after(), which Vercel stops at 60 s
// (maxDuration). The SDK's own default waits up to 10 minutes per try (and
// retries twice), so a slow model call used to be killed before the
// fallback (route the chat to a person and alert them) could run.
const state = vi.hoisted(() => ({ requests: [] as Array<{ timeout?: number; maxRetries?: number } | undefined> }));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    beta = {
      messages: {
        create: async (_params: unknown, options?: { timeout?: number; maxRetries?: number }) => {
          state.requests.push(options);
          throw new Error("slow");
        },
      },
    };
  }
  return { default: Anthropic };
});

import { decideSimpleFact } from "@/lib/ai";
import { EMPTY_CHEKELIN_INFO } from "@/lib/types";

afterEach(() => vi.unstubAllEnvs());

describe("chekelin's model call", () => {
  it("gives up inside the webhook's 60 s, retry included, leaving time for the fallback", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const result = await decideSimpleFact({
      businessName: "Luna",
      info: EMPTY_CHEKELIN_INFO,
      refs: [],
      templates: [],
      history: [{ direction: "in", body: "¿precio?" }],
    });
    expect(result.error).toBeTruthy();
    const { timeout, maxRetries } = state.requests[0] ?? {};
    expect(timeout).toBeDefined();
    expect(maxRetries).toBeDefined();
    expect(timeout! * (maxRetries! + 1)).toBeLessThanOrEqual(40_000);
  });
});
