import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { neverExpiringBisuToken } from "@/lib/channelHealth";

// Swapping Embedded Signup's 60-day token for a never-ending one (issue #56).
// Meta's Graph API is faked with `fetch`, answering each call in order.
let urls: string[] = [];
function fakeMeta(...responses: Array<{ status: number; body: unknown }>) {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(String(url));
      const next = responses.shift() ?? { status: 500, body: {} };
      return new Response(JSON.stringify(next.body), { status: next.status });
    }),
  );
}

const me = { status: 200, body: { client_business_id: "CB1", id: "SU1" } };
const minted = { status: 200, body: { access_token: "forever-token" } };
const debug = (expires_at: number, is_valid = true) => ({ status: 200, body: { data: { is_valid, expires_at, type: "SYSTEM_USER" } } });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_META_APP_ID", "APP");
  vi.stubEnv("WHATSAPP_APP_SECRET", "secret");
});

describe("neverExpiringBisuToken", () => {
  it("mints a token for the client business and keeps it when debug_token says it never ends", async () => {
    fakeMeta(me, minted, debug(0));
    const result = await neverExpiringBisuToken("60-day-token");
    expect(result?.token).toBe("forever-token");
    expect(result?.info.expiresAt).toBeNull();
    const proof = createHmac("sha256", "secret").update("60-day-token").digest("hex");
    expect(urls[1]).toContain("/CB1/system_user_access_tokens?");
    expect(urls[1]).toContain(`appsecret_proof=${proof}`);
    expect(urls[1]).toContain("system_user_id=SU1");
    expect(urls[1]).not.toContain("set_token_expires_in_60_days");
  });

  it("refuses a minted token that still ends", async () => {
    fakeMeta(me, minted, debug(Math.floor(Date.now() / 1000) + 86400));
    expect(await neverExpiringBisuToken("60-day-token")).toBeNull();
  });

  it("gives up when the token isn't a business integration token or Meta refuses", async () => {
    fakeMeta({ status: 200, body: { id: "U1" } });
    expect(await neverExpiringBisuToken("user-token")).toBeNull();
    fakeMeta(me, { status: 400, body: { error: { code: 200 } } });
    expect(await neverExpiringBisuToken("60-day-token")).toBeNull();
  });
});
