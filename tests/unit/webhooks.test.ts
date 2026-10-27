import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memoryDb";

// The two Meta webhooks end to end (src/app/api/whatsapp/webhook and
// src/app/api/meta/webhook): signed request in, rows out. The database is an
// in-memory stand-in for the service role; chekelin, media downloads and
// chekelin's reading of comments are recorded instead of run.
const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("./memoryDb").memoryDb>,
  afterTasks: [] as Array<() => unknown>,
  inbound: [] as string[],
  processedComments: [] as string[][],
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => state.afterTasks.push(task),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db.client }));
vi.mock("@/lib/bot", () => ({
  handleInboundMessage: async (_: unknown, conversationId: string) => {
    state.inbound.push(conversationId);
    return {};
  },
}));
vi.mock("@/lib/messageMedia", () => ({ saveMessageMedia: async () => {} }));
vi.mock("@/lib/commentsServer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/commentsServer")>()),
  processComments: async (_: unknown, ids: string[]) => {
    state.processedComments.push(ids);
  },
}));

import { NextRequest } from "next/server";
import { POST as whatsappPOST } from "@/app/api/whatsapp/webhook/route";
import { POST as metaPOST } from "@/app/api/meta/webhook/route";

const SECRET = "app-secret";
const BIZ = "biz-1";
const OTHER_BIZ = "biz-2";

function signed(url: string, payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
  return new NextRequest(url, { method: "POST", body, headers: { "x-hub-signature-256": signature } });
}
const toWhatsApp = (payload: unknown, secret?: string) => whatsappPOST(signed("http://cheke.test/api/whatsapp/webhook", payload, secret));
const toMeta = (payload: unknown, secret?: string) => metaPOST(signed("http://cheke.test/api/meta/webhook", payload, secret));

// Runs what the route left for after the response (chekelin, comments).
async function flushAfter() {
  while (state.afterTasks.length) await state.afterTasks.shift()!();
}

beforeEach(() => {
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_META_APP_ID", "APP1");
  // Meta's profile lookup for new Instagram/Facebook contacts: unavailable.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
  state.afterTasks = [];
  state.inbound = [];
  state.processedComments = [];
  state.db = memoryDb({
    channels: [
      { id: "ch-wa", business_id: BIZ, store_id: "store-1", type: "whatsapp", status: "connected", external_id: "PN1", access_token_encrypted: null },
      { id: "ch-ig", business_id: BIZ, store_id: "store-1", type: "instagram", status: "connected", external_id: "IG1", page_id: "PAGE1", access_token_encrypted: null },
      { id: "ch-fb", business_id: BIZ, store_id: "store-1", type: "facebook", status: "connected", external_id: "PAGE1", page_id: "PAGE1", access_token_encrypted: null },
      { id: "ch-old", business_id: OTHER_BIZ, store_id: "store-9", type: "whatsapp", status: "disconnected", external_id: "PN9", access_token_encrypted: null },
    ],
  });
});

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

const waText = (id: string, body: string, extra: Record<string, unknown> = {}) => ({
  from: "50499223843",
  id,
  timestamp: "1760000000",
  type: "text",
  text: { body },
  ...extra,
});
const waPayload = (messages: unknown[], phoneNumberId = "PN1", field = "messages") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA1",
      changes: [
        {
          field,
          value: {
            metadata: { phone_number_id: phoneNumberId },
            contacts: [{ wa_id: "50499223843", profile: { name: "Ana" } }],
            messages,
          },
        },
      ],
    },
  ],
});
const messages = () => state.db.rows("messages");

describe("WhatsApp webhook", () => {
  it("refuses a request Meta didn't sign, and saves nothing", async () => {
    const res = await toWhatsApp(waPayload([waText("wamid.1", "hola")]), "wrong-secret");
    expect(res.status).toBe(401);
    expect(messages()).toHaveLength(0);
  });

  it("saves a customer's message once, even when Meta delivers it twice", async () => {
    const payload = waPayload([waText("wamid.1", "¿Tienen talla M?")]);
    expect((await toWhatsApp(payload)).status).toBe(200);
    expect((await toWhatsApp(payload)).status).toBe(200);
    await flushAfter();

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({ body: "¿Tienen talla M?", direction: "in", business_id: BIZ, external_message_id: "wamid.1" });
    const [conversation] = state.db.rows("conversations");
    expect(conversation).toMatchObject({ channel_id: "ch-wa", store_id: "store-1", status: "open" });
    expect(conversation.window_expires_at).toBeTruthy();
    expect(state.db.rows("contacts")).toMatchObject([{ name: "Ana", phone: "50499223843", business_id: BIZ }]);
    // chekelin hears about it once.
    expect(state.inbound).toEqual([conversation.id]);
  });

  it("ignores numbers that aren't connected (anymore)", async () => {
    await toWhatsApp(waPayload([waText("wamid.1", "hola")], "PN9"));
    expect(messages()).toHaveLength(0);
  });

  it("links a quoted reply to the message it answers", async () => {
    await toWhatsApp(waPayload([waText("wamid.1", "¿precio?")]));
    await toWhatsApp(waPayload([waText("wamid.2", "y en azul?", { context: { from: "50499223843", id: "wamid.1" } })]));
    const [first, second] = messages();
    expect(second.reply_to_id).toBe(first.id);
  });

  it("a reaction, edit or delete changes the message instead of adding one", async () => {
    await toWhatsApp(waPayload([waText("wamid.1", "quiero 2")]));
    await toWhatsApp(waPayload([{ from: "50499223843", id: "wamid.r", timestamp: "1760000001", type: "reaction", reaction: { message_id: "wamid.1", emoji: "👍" } }]));
    expect(messages()).toHaveLength(1);
    expect(messages()[0].reaction_in).toBe("👍");

    await toWhatsApp(waPayload([{ from: "50499223843", id: "wamid.r2", timestamp: "1760000002", type: "reaction", reaction: { message_id: "wamid.1", emoji: "" } }]));
    expect(messages()[0].reaction_in).toBeNull();

    await toWhatsApp(
      waPayload([{ from: "50499223843", id: "wamid.e", timestamp: "1760000003", type: "edit", edit: { original_message_id: "wamid.1", message: { type: "text", text: { body: "quiero 3" } } } }]),
    );
    expect(messages()[0]).toMatchObject({ body: "quiero 3" });
    expect(messages()[0].edited_at).toBeTruthy();

    await toWhatsApp(waPayload([{ from: "50499223843", id: "wamid.d", timestamp: "1760000004", type: "revoke", revoke: { original_message_id: "wamid.1" } }]));
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({ body: "Mensaje eliminado" });
    expect(messages()[0].deleted_at).toBeTruthy();
  });

  it("a customer can't edit or delete the business's message", async () => {
    state.db.rows("messages").push({ id: "m-out", business_id: BIZ, conversation_id: "c", direction: "out", body: "Son L 300", external_message_id: "wamid.out" });
    await toWhatsApp(waPayload([{ from: "50499223843", id: "wamid.d", timestamp: "1760000004", type: "revoke", revoke: { original_message_id: "wamid.out" } }]));
    expect(messages()[0]).toMatchObject({ body: "Son L 300" });
  });

  it("a reaction never touches another Negocio's message with the same id", async () => {
    state.db.rows("messages").push({ id: "m-x", business_id: OTHER_BIZ, conversation_id: "c", direction: "out", body: "x", external_message_id: "wamid.x" });
    await toWhatsApp(waPayload([{ from: "50499223843", id: "wamid.r", timestamp: "1", type: "reaction", reaction: { message_id: "wamid.x", emoji: "😂" } }]));
    expect(messages()[0].reaction_in).toBeUndefined();
  });

  it("saves the Click-to-WhatsApp ad on the chat; the first ad wins", async () => {
    const ad = (id: string, adId: string, headline: string) =>
      waText(id, "Can I get more info about this?", {
        referral: { source_url: "https://fb.me/3cr4Wqqkv", source_id: adId, source_type: "ad", headline, body: "Summer Succulents are here!", media_type: "image", ctwa_clid: "Aff-n8ZT" },
      });
    await toWhatsApp(waPayload([ad("wamid.1", "120226305854810726", "Chat with us")]));
    await toWhatsApp(waPayload([ad("wamid.2", "999", "Otro anuncio")]));
    const [conversation] = state.db.rows("conversations");
    expect(conversation).toMatchObject({
      referral_source: "anuncio",
      referral_ad_id: "120226305854810726",
      referral_headline: "Chat with us",
      referral_url: "https://fb.me/3cr4Wqqkv",
    });
    expect((conversation.referral as { ctwa_clid: string }).ctwa_clid).toBe("Aff-n8ZT");
    expect(conversation.referral_at).toBeTruthy();
  });

  it("delivery ticks only move forward", async () => {
    state.db.rows("messages").push({ id: "m-out", business_id: BIZ, conversation_id: "c", direction: "out", body: "x", external_message_id: "wamid.out", status: "sent" });
    const status = (s: string) => ({
      object: "whatsapp_business_account",
      entry: [{ id: "WABA1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN1" }, statuses: [{ id: "wamid.out", status: s }] } }] }],
    });
    await toWhatsApp(status("read"));
    await toWhatsApp(status("delivered"));
    expect(messages()[0].status).toBe("read");
  });

  it("a «BAJA» reply opts the customer out of Campañas (and still reaches chekelin)", async () => {
    await toWhatsApp(waPayload([waText("wamid.1", "BAJA")]));
    await flushAfter();
    expect(state.db.rows("contacts")[0].marketing_opt_out).toBe(true);
    expect(state.inbound).toHaveLength(1);
  });

  it("Campaña failures: 131049 retries once after 24 h, 131050 opts out", async () => {
    state.db.rows("contacts").push({ id: "ct-1", business_id: BIZ, name: "Ana", phone: "50499223843" });
    state.db.rows("broadcasts").push({ id: "b-1", business_id: BIZ, status: "done" });
    state.db.rows("broadcast_recipients").push(
      { id: "r-1", broadcast_id: "b-1", contact_id: "ct-1", attempts: 1, status: "sent", external_message_id: "wamid.b1" },
      { id: "r-2", broadcast_id: "b-1", contact_id: "ct-1", attempts: 1, status: "sent", external_message_id: "wamid.b2" },
    );
    for (const id of ["wamid.b1", "wamid.b2"]) {
      state.db.rows("messages").push({ id: `m-${id}`, business_id: BIZ, conversation_id: "c", direction: "out", body: "x", external_message_id: id, status: "sent" });
    }
    const failed = (id: string, code: number) => ({
      object: "whatsapp_business_account",
      entry: [{ id: "WABA1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN1" }, statuses: [{ id, status: "failed", errors: [{ code }] }] } }] }],
    });
    await toWhatsApp(failed("wamid.b1", 131049));
    const [r1] = state.db.rows("broadcast_recipients");
    expect(r1).toMatchObject({ status: "pending", error_code: 131049 });
    expect(new Date(r1.next_attempt_at as string).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect(state.db.rows("broadcasts")[0].status).toBe("sending");

    await toWhatsApp(failed("wamid.b2", 131050));
    expect(state.db.rows("broadcast_recipients")[1]).toMatchObject({ status: "failed", error_code: 131050 });
    expect(state.db.rows("contacts")[0].marketing_opt_out).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Instagram / Messenger
// ---------------------------------------------------------------------------

const igEvent = (event: Record<string, unknown>, senderId = "IGSID1") => ({
  object: "instagram",
  entry: [{ id: "IG1", time: 1760000000000, messaging: [{ sender: { id: senderId }, recipient: { id: "IG1" }, timestamp: 1760000000000, ...event }] }],
});

describe("Instagram / Messenger webhook", () => {
  it("refuses a request Meta didn't sign", async () => {
    const res = await toMeta(igEvent({ message: { mid: "mid.1", text: "hola" } }), "wrong-secret");
    expect(res.status).toBe(401);
    expect(messages()).toHaveLength(0);
  });

  it("saves a DM once, with a new Contacto found by their Instagram id", async () => {
    const payload = igEvent({ message: { mid: "mid.1", text: "¿precio?" } });
    await toMeta(payload);
    await toMeta(payload);
    await flushAfter();
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({ body: "¿precio?", direction: "in", external_message_id: "mid.1" });
    expect(state.db.rows("contacts")).toMatchObject([{ ig_id: "IGSID1", name: "Cliente de Instagram", business_id: BIZ }]);
    expect(state.inbound).toHaveLength(1);
  });

  it("reactions, edits and unsends change the message; only its author edits or unsends it", async () => {
    await toMeta(igEvent({ message: { mid: "mid.1", text: "quiero 2" } }));
    state.db.rows("messages").push({ id: "m-out", business_id: BIZ, conversation_id: "c", direction: "out", body: "Son L 300", external_message_id: "mid.out" });

    await toMeta(igEvent({ reaction: { mid: "mid.out", action: "react", reaction: "love", emoji: "❤️" } }));
    expect(messages().find((m) => m.id === "m-out")?.reaction_in).toBe("❤️");
    await toMeta(igEvent({ reaction: { mid: "mid.out", action: "unreact" } }));
    expect(messages().find((m) => m.id === "m-out")?.reaction_in).toBeNull();

    await toMeta(igEvent({ message_edit: { mid: "mid.1", text: "quiero 3", num_edit: 1 } }));
    await toMeta(igEvent({ message_edit: { mid: "mid.out", text: "gratis", num_edit: 1 } }));
    expect(messages()[0].body).toBe("quiero 3");
    expect(messages().find((m) => m.id === "m-out")?.body).toBe("Son L 300");

    await toMeta(igEvent({ message: { mid: "mid.1", is_deleted: true } }));
    expect(messages()[0]).toMatchObject({ body: "Mensaje eliminado" });
    expect(messages()).toHaveLength(2);
  });

  it("Messenger read receipts mark what the business sent as read", async () => {
    await toMeta({ object: "page", entry: [{ id: "PAGE1", messaging: [{ sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 1760000000000, message: { mid: "mid.fb1", text: "hola" } }] }] });
    const conversation = state.db.rows("conversations")[0];
    state.db.rows("messages").push({ id: "m-out", business_id: BIZ, conversation_id: conversation.id, direction: "out", body: "x", external_message_id: "mid.fbout", status: "delivered", created_at: new Date(1760000001000).toISOString() });
    await toMeta({ object: "page", entry: [{ id: "PAGE1", messaging: [{ sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 1760000005000, read: { watermark: 1760000002000 } }] }] });
    expect(messages().find((m) => m.id === "m-out")?.status).toBe("read");
  });

  it("saves the Instagram ad the chat came from", async () => {
    const referral = { ref: "x", ad_id: "AD9", source: "ADS", type: "OPEN_THREAD", ads_context_data: { ad_title: "Zapatos 2x1" } };
    await toMeta(igEvent({ message: { mid: "mid.ad", text: "info", referral } }));
    expect(state.db.rows("conversations")[0]).toMatchObject({ referral_source: "anuncio", referral_ad_id: "AD9", referral_headline: "Zapatos 2x1", referral });
  });

  it("Messenger: an ad tapped from a chat already open, sent on its own", async () => {
    const fb = (event: Record<string, unknown>) => ({
      object: "page",
      entry: [{ id: "PAGE1", messaging: [{ sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 1760000000000, ...event }] }],
    });
    const referral = { ad_id: "AD7", source: "ADS", type: "OPEN_THREAD", ads_context_data: { ad_title: "Promo" } };
    // No chat yet: nothing to attach it to.
    await toMeta(fb({ referral }));
    expect(state.db.rows("conversations")).toHaveLength(0);

    await toMeta(fb({ message: { mid: "mid.fb1", text: "hola" } }));
    await toMeta(fb({ referral }));
    expect(state.db.rows("conversations")[0]).toMatchObject({ referral_ad_id: "AD7", referral_headline: "Promo" });
    expect(messages()).toHaveLength(1);
  });

  it("an echo of what cheke itself sent is not saved twice", async () => {
    await toMeta(igEvent({ message: { mid: "mid.echo", text: "hola", is_echo: true, app_id: "APP1" } }, "IG1"));
    await flushAfter();
    expect(messages()).toHaveLength(0);
  });
});

describe("Comentarios webhook", () => {
  const igComment = (id: string, fromId = "IGSID7") => ({
    object: "instagram",
    entry: [{ id: "IG1", time: 1760000000, changes: [{ field: "comments", value: { id, text: "¿precio?", from: { id: fromId, username: "ana.hn" }, media: { id: "POST1" } } }] }],
  });

  it("saves a new comment once and hands it to chekelin after answering Meta", async () => {
    await toMeta(igComment("c1"));
    await toMeta(igComment("c1"));
    await flushAfter();
    const comments = state.db.rows("post_comments");
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ channel_id: "ch-ig", store_id: "store-1", body: "¿precio?", author_name: "@ana.hn", post_external_id: "POST1" });
    expect(state.processedComments).toEqual([[comments[0].id]]);
  });

  it("skips the account's own comments (its replies, including cheke's)", async () => {
    await toMeta(igComment("c2", "IG1"));
    expect(state.db.rows("post_comments")).toHaveLength(0);
  });

  it("saves Facebook Page comments from the feed", async () => {
    await toMeta({
      object: "page",
      entry: [{ id: "PAGE1", time: 1760000000, changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: "fbc1", post_id: "PAGE1_9", parent_id: "PAGE1_9", message: "info", from: { id: "PSID7", name: "Luis" }, created_time: 1760000000 } }] }],
    });
    expect(state.db.rows("post_comments")).toMatchObject([{ channel_id: "ch-fb", platform: "facebook", author_name: "Luis", parent_external_id: null }]);
  });
});
