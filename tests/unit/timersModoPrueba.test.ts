import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memoryDb";

// The 5-minute timer (/api/cron/chekelin) in a modo prueba chat: a sample
// chat (no real number) where the "customer" was handed to a person. The
// simple-fact model call is real money but not a real customer: the cost
// report (`npm run report:chekelin-cost`, test = false) must leave it out,
// like chekelin's own replies in modo prueba.
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  decideSimpleFact: async () => ({
    decision: { reply: "La blusa está en L 450.", simpleFact: true },
    usage: [{ model: "claude-sonnet-5-5", input_tokens: 300, output_tokens: 40, cache_read_tokens: 0, cache_write_tokens: 0 }],
  }),
}));
vi.mock("@/lib/push", () => ({ sendPushToPeople: async () => {}, notifyConversation: async () => {} }));

import { runTimers } from "@/lib/bot";

const BIZ = "biz-1";
let db: ReturnType<typeof memoryDb>;

function seed(channel: Record<string, unknown>) {
  const sixMinutesAgo = new Date(Date.now() - 6 * 60_000).toISOString();
  db = memoryDb({
    businesses: [{ id: BIZ, name: "Tienda Luna", plan: "plus", is_demo: false }],
    stores: [{ id: "s1", business_id: BIZ, name: "Centro", chekelin_off_until: null }],
    channels: [{ id: "ch", business_id: BIZ, store_id: "s1", type: "whatsapp", status: "connected", ...channel }],
    contacts: [{ id: "c1", business_id: BIZ, name: "Ana", phone: "50499990001" }],
    conversations: [
      {
        id: "conv",
        business_id: BIZ,
        store_id: "s1",
        contact_id: "c1",
        channel_id: "ch",
        bot_enabled: true,
        handed_off_at: sixMinutesAgo,
        assigned_to: null,
        last_inbound_at: sixMinutesAgo,
        awaiting_since: sixMinutesAgo,
        wait_notice_sent_at: sixMinutesAgo,
        window_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
    ],
    messages: [{ id: "m1", conversation_id: "conv", business_id: BIZ, direction: "in", body: "¿precio de la blusa?", created_at: sixMinutesAgo }],
  });
  db.client.rpc = (async (name: string) =>
    name === "chekelin_due_conversations"
      ? { data: [{ id: "conv", facts_due: true, notice_due: false, escalation_due: false }], error: null }
      : { data: null, error: null }) as typeof db.client.rpc;
}

describe("chekelin timers in modo prueba", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("a sample chat's simple fact is recorded as a test, out of the cost report", async () => {
    seed({ external_id: null, access_token_encrypted: null });
    await runTimers(db.client as never);
    expect(db.rows("chekelin_usage")).toEqual([expect.objectContaining({ kind: "simple_fact", test: true })]);
  });

  it("a real customer's simple fact counts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }))));
    seed({ external_id: "PN1", access_token_encrypted: null });
    await runTimers(db.client as never);
    expect(db.rows("chekelin_usage")).toEqual([expect.objectContaining({ kind: "simple_fact", test: false })]);
  });
});
