import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memoryDb";
import { handleTemplateFailure, runBroadcasts, STUCK_REASON } from "@/lib/broadcastsServer";
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

  // Vercel kills a run at 60 s: only the customer being sent may be left
  // "sending", never the rest of the batch.
  it("claims each customer only when it is their turn", async () => {
    const from = db.client.from;
    const seen: string[][] = [];
    db.client.from = ((table: string) => {
      if (table === "messages") seen.push(recipients().map((r) => r.status as string));
      return from(table);
    }) as typeof from;
    await runBroadcasts(admin());
    expect(seen[0]).toEqual(["sending", "pending", "pending"]);
  });

  it("one customer that throws doesn't strand the others", async () => {
    const from = db.client.from;
    let calls = 0;
    db.client.from = ((table: string) => {
      if (table === "conversations" && calls++ === 0) throw new Error("boom");
      return from(table);
    }) as typeof from;
    expect(await runBroadcasts(admin())).toEqual({ sent: 2, failed: 1 });
    expect(recipients().map((r) => r.status)).toEqual(["failed", "sent", "sent"]);
    expect(db.rows("broadcasts")[0].status).toBe("done");
  });
});

describe("Difusión follow-ups (migration 0044)", () => {
  it("labels its messages as a Difusión (source) and keeps them automated for chekelin", async () => {
    await runBroadcasts(admin());
    expect(db.rows("messages").every((m) => m.source === "broadcast" && m.is_bot === true)).toBe(true);
  });

  it("Cancelar mid-run: the claimed customers not sent yet are not sent, and it stays cancelled", async () => {
    const client = db.client as unknown as { from: (t: string) => unknown };
    const from = client.from.bind(client);
    let cancelled = false;
    client.from = (table: string) => {
      // cancel_broadcast runs right after the first message is saved.
      if (table === "conversations" && db.rows("messages").length === 1 && !cancelled) {
        cancelled = true;
        db.rows("broadcasts")[0].status = "cancelled";
        for (const r of recipients()) if (r.status === "pending" || r.status === "sending") r.status = "cancelled";
      }
      return from(table);
    };
    expect(await runBroadcasts(admin())).toEqual({ sent: 1, failed: 0 });
    expect(recipients().map((r) => r.status)).toEqual(["sent", "cancelled", "cancelled"]);
    expect(db.rows("messages")).toHaveLength(1);
    expect(db.rows("broadcasts")[0].status).toBe("cancelled");
  });

  it("a cancelled Difusión is never sent", async () => {
    db.rows("broadcasts")[0].status = "cancelled";
    expect(await runBroadcasts(admin())).toEqual({ sent: 0, failed: 0 });
    expect(db.rows("messages")).toHaveLength(0);
  });

  it("131049 after Cancelar doesn't bring it back", async () => {
    db.rows("broadcasts")[0].status = "cancelled";
    Object.assign(recipients()[0], { status: "sent", attempts: 1, external_message_id: "wamid.1" });
    await handleTemplateFailure(admin(), "wamid.1", 131049);
    expect(recipients()[0].status).toBe("cancelled");
    expect(db.rows("broadcasts")[0].status).toBe("cancelled");
  });

  it("a customer stuck 'sending' over 15 min is marked failed with a reason, never resent", async () => {
    Object.assign(recipients()[0], { status: "sending", claimed_at: new Date(Date.now() - 16 * 60_000).toISOString() });
    Object.assign(recipients()[1], { status: "sending", claimed_at: new Date(Date.now() - 60_000).toISOString() });
    expect(await runBroadcasts(admin())).toEqual({ sent: 1, failed: 0 });
    expect(recipients().map((r) => r.status)).toEqual(["failed", "sending", "sent"]);
    expect(recipients()[0].error_reason).toBe(STUCK_REASON);
    expect(db.rows("messages")).toHaveLength(1);
  });
});
