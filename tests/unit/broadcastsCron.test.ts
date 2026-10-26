import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memoryDb";
import { runBroadcasts } from "@/lib/broadcastsServer";
import type { SupabaseClient } from "@supabase/supabase-js";

// /api/cron/broadcasts against the in-memory database. The Negocio is the
// reviewers' demo one (saves without calling Meta), and its number has no
// token, so the 24 h limit falls back to 250.
const BIZ = "biz-1";
const hourAgo = new Date(Date.now() - 3_600_000).toISOString();

let db: ReturnType<typeof memoryDb>;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
  db = memoryDb({
    businesses: [{ id: BIZ, is_demo: true }],
    channels: [{ id: "ch", business_id: BIZ, store_id: "s1", type: "whatsapp", status: "connected", external_id: "PN1", waba_id: "W1", access_token_encrypted: null }],
    contacts: [
      { id: "c1", business_id: BIZ, name: "ana lópez", phone: "99990001", marketing_opt_out: false },
      { id: "c2", business_id: BIZ, name: "Beto", phone: "99990002", marketing_opt_out: false },
      { id: "c3", business_id: BIZ, name: "Caro", phone: "99990003", marketing_opt_out: false },
      { id: "c4", business_id: BIZ, name: "Dani", phone: "99990004", marketing_opt_out: true },
    ],
    broadcasts: [
      {
        id: "b1",
        business_id: BIZ,
        channel_id: "ch",
        status: "sending",
        created_at: hourAgo,
        template: { name: "oferta", language: "es", category: "MARKETING", components: [{ type: "BODY", text: "Hola {{1}}, 20% hoy" }] },
        template_values: { "1": "amigo" },
        name_variable: "1",
      },
    ],
    broadcast_recipients: ["c1", "c2", "c3"].map((c, i) => ({
      id: `r${i + 1}`,
      broadcast_id: "b1",
      business_id: BIZ,
      contact_id: c,
      status: "pending",
      attempts: 0,
      next_attempt_at: hourAgo,
      created_at: hourAgo,
    })),
  });
});

const admin = () => db.client as unknown as SupabaseClient;
const recipients = () => db.rows("broadcast_recipients").filter((r) => r.broadcast_id === "b1");

describe("runBroadcasts", () => {
  it("sends in Chat with each customer's name and finishes the Difusión", async () => {
    expect(await runBroadcasts(admin())).toEqual({ sent: 3, failed: 0 });
    expect(recipients().map((r) => r.status)).toEqual(["sent", "sent", "sent"]);
    expect(db.rows("messages")[0]).toMatchObject({ body: "Hola Ana, 20% hoy", direction: "out", is_bot: true });
    expect(db.rows("conversations")).toHaveLength(3);
    expect(db.rows("broadcasts")[0].status).toBe("done");
  });

  it("stops at the 24 h limit and leaves the rest for later", async () => {
    // 248 already sent today: room for 2 more of the 250.
    for (let i = 0; i < 248; i++) {
      db.rows("broadcast_recipients").push({ id: `old${i}`, broadcast_id: "b0", business_id: BIZ, contact_id: "c1", status: "sent", sent_at: hourAgo });
    }
    expect(await runBroadcasts(admin())).toEqual({ sent: 2, failed: 0 });
    expect(recipients().map((r) => r.status)).toEqual(["sent", "sent", "pending"]);
    expect(db.rows("broadcasts")[0].status).toBe("sending");
  });

  it("skips a customer who opted out after it was created", async () => {
    recipients()[2].contact_id = "c4";
    await runBroadcasts(admin());
    expect(recipients().map((r) => r.status)).toEqual(["sent", "sent", "skipped"]);
  });

  it("caps each run", async () => {
    expect(await runBroadcasts(admin(), { maxPerRun: 1 })).toEqual({ sent: 1, failed: 0 });
  });
});
