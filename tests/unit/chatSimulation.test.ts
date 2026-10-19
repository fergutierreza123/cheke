import { createHmac, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memoryDb";

// Whole conversations through cheke's public seams, the way a real chat
// goes: Meta's signed webhooks bring the customer's messages in, Chat's
// server actions and /api/chat/media answer, and Meta's status webhooks move
// the ticks. One in-memory database plays both the signed-in client and the
// service role; Meta's Graph API is a fake `fetch`. chekelin, ffmpeg and the
// media downloader are recorded instead of run.
const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("./memoryDb").memoryDb>,
  afterTasks: [] as Array<() => unknown>,
  chekelin: [] as Array<{ conversationId: string; sendExternally?: boolean }>,
  mediaJobs: [] as Array<{ externalMessageId: string; kind: string; info: Record<string, unknown> }>,
  graph: [] as Array<{ url: string; body: unknown }>,
  graphReplies: [] as Array<{ status: number; body: unknown }>,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => state.afterTasks.push(task),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.db.client }));
vi.mock("@/lib/bot", () => ({
  handleInboundMessage: async (_: unknown, conversationId: string, options: { sendExternally?: boolean } = {}) => {
    state.chekelin.push({ conversationId, sendExternally: options.sendExternally });
    return {};
  },
  afterPaymentConfirmed: vi.fn(),
}));
vi.mock("@/lib/push", () => ({ sendPushToPeople: vi.fn(), notifyConversation: vi.fn() }));
vi.mock("@/lib/messageMedia", () => ({
  saveMessageMedia: async (_: unknown, jobs: typeof state.mediaJobs) => {
    state.mediaJobs.push(...jobs);
  },
  toM4a: async () => Buffer.from("m4a-audio"),
}));
vi.mock("@/lib/voiceNote", () => ({ toVoiceNote: async () => Buffer.from("ogg-opus") }));
vi.mock("@/lib/videoConvert", () => ({ toMp4: async () => Buffer.from("mp4") }));
vi.mock("@/lib/channelHealth", () => ({ markChannelNeedsReconnect: vi.fn(), regeneratePageToken: vi.fn(async () => null) }));

import { NextRequest } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { POST as whatsappWebhook } from "@/app/api/whatsapp/webhook/route";
import { POST as metaWebhook } from "@/app/api/meta/webhook/route";
import { POST as chatMedia } from "@/app/api/chat/media/route";
import { prepareChatUpload } from "@/app/(app)/chat/mediaActions";
import { simulateInboundMessage } from "@/app/(app)/chat/actions";

const SECRET = "app-secret";
const KEY = randomBytes(32).toString("base64");
const BIZ = "biz-1";
const STORE = "store-1";
const HOUR = 60 * 60 * 1000;

function signed(url: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", SECRET).update(body, "utf8").digest("hex")}`;
  return new NextRequest(url, { method: "POST", body, headers: { "x-hub-signature-256": signature } });
}
const toWhatsApp = (payload: unknown) => whatsappWebhook(signed("http://cheke.test/api/whatsapp/webhook", payload));
const toMeta = (payload: unknown) => metaWebhook(signed("http://cheke.test/api/meta/webhook", payload));
async function flushAfter() {
  while (state.afterTasks.length) await state.afterTasks.shift()!();
}

const rows = (table: string) => state.db.rows(table);
const messages = () => rows("messages");

// A file the browser uploaded with prepareChatUpload, then sent through
// /api/chat/media, exactly like the composer does.
async function sendFromComposer(
  conversationId: string,
  file: { kind: "voice" | "document" | "image" | "video"; mime: string; filename?: string; caption?: string },
  options: { asCustomer?: boolean; replyToId?: string } = {},
) {
  const bytes = Buffer.from("file-bytes");
  const prep = await prepareChatUpload(
    conversationId,
    { kind: file.kind, mime: file.mime, size: bytes.length, filename: file.filename },
    { asCustomer: options.asCustomer },
  );
  if (prep.error) return { error: prep.error } as { error?: string; message?: Record<string, unknown>; sendError?: string };
  await state.db.client.storage.from("message-media").uploadToSignedUrl(prep.path!, prep.token!, bytes, { contentType: file.mime });
  const res = await chatMedia(
    new Request("http://cheke.test/api/chat/media", {
      method: "POST",
      body: JSON.stringify({
        conversationId,
        kind: file.kind,
        path: prep.path,
        filename: file.filename,
        caption: file.caption,
        duration: file.kind === "voice" ? 4 : undefined,
        replyToId: options.replyToId,
        asCustomer: options.asCustomer,
      }),
    }),
  );
  return (await res.json()) as { error?: string; message?: Record<string, unknown>; sendError?: string };
}

beforeEach(() => {
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
  vi.stubEnv("CHANNEL_TOKEN_KEY", KEY);
  vi.stubEnv("META_SYSTEM_USER_TOKEN", "");
  vi.stubEnv("NEXT_PUBLIC_META_APP_ID", "APP1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  state.afterTasks = [];
  state.chekelin = [];
  state.mediaJobs = [];
  state.graph = [];
  state.graphReplies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      state.graph.push({ url: String(url), body });
      const next = state.graphReplies.shift() ?? { status: 200, body: { id: "media-1", messages: [{ id: `wamid.out${state.graph.length}` }], message_id: `mid.out${state.graph.length}` } };
      return new Response(JSON.stringify(next.body), { status: next.status });
    }),
  );
  state.db = memoryDb({
    businesses: [{ id: BIZ, is_demo: false }],
    stores: [{ id: STORE, business_id: BIZ, name: "Centro", archived_at: null }],
    channels: [
      { id: "ch-wa", business_id: BIZ, store_id: STORE, type: "whatsapp", status: "connected", external_id: "PN1", page_id: null, access_token_encrypted: encryptSecret("wa-token"), coexistence: true },
      { id: "ch-ig", business_id: BIZ, store_id: STORE, type: "instagram", status: "connected", external_id: "IG1", page_id: "PAGE1", access_token_encrypted: encryptSecret("page-token") },
      { id: "ch-fb", business_id: BIZ, store_id: STORE, type: "facebook", status: "connected", external_id: "PAGE1", page_id: "PAGE1", access_token_encrypted: encryptSecret("page-token") },
      // A sample chat's channel (seeded): never connected to anyone.
      { id: "ch-sample", business_id: BIZ, store_id: STORE, type: "whatsapp", status: "connected", external_id: null, page_id: null, access_token_encrypted: null },
    ],
    contacts: [{ id: "k-sample", business_id: BIZ, name: "María (ejemplo)", phone: "50499990000", fb_psid: null, ig_id: null }],
    conversations: [
      // Quiet for two days: the WhatsApp window is closed.
      { id: "c-sample", business_id: BIZ, store_id: STORE, contact_id: "k-sample", channel_id: "ch-sample", status: "open", window_expires_at: new Date(Date.now() - 24 * HOUR).toISOString(), last_message_at: null, created_at: new Date(Date.now() - 48 * HOUR).toISOString() },
    ],
  });
});

describe("Modo prueba: the person writes, records and attaches as the customer", () => {
  it("a voice note recorded in a sample chat arrives as the customer's, reopens the chat and wakes chekelin — nothing goes to Meta", async () => {
    const result = await sendFromComposer("c-sample", { kind: "voice", mime: "audio/webm" }, { asCustomer: true });

    expect(result.error).toBeUndefined();
    expect(result.message).toMatchObject({ direction: "in", media_kind: "voice", body: "🎤 Nota de voz" });
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({ direction: "in", media_kind: "voice" });
    expect(messages()[0].media_m4a_path).toBeTruthy();
    // The "customer" just wrote: the reply window is open again.
    const conversation = rows("conversations").find((c) => c.id === "c-sample")!;
    expect(new Date(conversation.window_expires_at as string).getTime()).toBeGreaterThan(Date.now() + 23 * HOUR);
    expect(state.chekelin).toEqual([{ conversationId: "c-sample", sendExternally: false }]);
    expect(state.graph).toHaveLength(0);
  });

  it("photos and documents work the same way", async () => {
    const photo = await sendFromComposer("c-sample", { kind: "image", mime: "image/jpeg", filename: "blusa.jpg", caption: "¿la tienen en M?" }, { asCustomer: true });
    const doc = await sendFromComposer("c-sample", { kind: "document", mime: "application/pdf", filename: "pedido.pdf" }, { asCustomer: true });
    expect(photo.message).toMatchObject({ direction: "in", media_kind: "image", body: "📷 ¿la tienen en M?" });
    expect(doc.message).toMatchObject({ direction: "in", media_kind: "document", body: "📄 pedido.pdf" });
    expect(state.graph).toHaveLength(0);
  });

  it("is refused in a real customer's chat (it would mix into their history)", async () => {
    rows("contacts").push({ id: "k-real", business_id: BIZ, name: "Ana", phone: "50499223843" });
    rows("conversations").push({ id: "c-real", business_id: BIZ, store_id: STORE, contact_id: "k-real", channel_id: "ch-wa", window_expires_at: new Date(Date.now() + HOUR).toISOString() });
    const result = await sendFromComposer("c-real", { kind: "voice", mime: "audio/webm" }, { asCustomer: true });
    expect(result.error).toMatch(/modo prueba solo funciona en chats de ejemplo/i);
    expect(messages()).toHaveLength(0);
    expect(state.graph).toHaveLength(0);
  });

  it("a typed test message also reopens the reply window", async () => {
    const result = await simulateInboundMessage("c-sample", "hola, ¿precio?");
    expect(result.inbound).toMatchObject({ direction: "in", body: "hola, ¿precio?" });
    const conversation = rows("conversations").find((c) => c.id === "c-sample")!;
    expect(new Date(conversation.window_expires_at as string).getTime()).toBeGreaterThan(Date.now() + 23 * HOUR);
  });
});

// ---------------------------------------------------------------------------
// WhatsApp: a whole conversation
// ---------------------------------------------------------------------------

const CUSTOMER = "50499223843";
const T0 = Math.floor(Date.now() / 1000) - 60; // a minute ago, in Meta's seconds

const wa = (value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN1" }, ...value } }] }],
});
const fromCustomer = (...messages: Array<Record<string, unknown>>) =>
  wa({ contacts: [{ wa_id: CUSTOMER, profile: { name: "Ana" } }], messages: messages.map((m) => ({ from: CUSTOMER, timestamp: String(T0), ...m })) });
const statuses = (...list: Array<Record<string, unknown>>) => wa({ statuses: list });
const byExternal = (id: string) => messages().find((m) => m.external_message_id === id)!;
const graphMessages = () => state.graph.filter((c) => c.url.endsWith("/messages")).map((c) => c.body as Record<string, unknown>);

describe("WhatsApp: a whole conversation", () => {
  it("every kind a customer can send is saved once, in the order it was sent, with its file queued", async () => {
    await toWhatsApp(
      fromCustomer(
        { id: "w.text", type: "text", text: { body: "Hola, ¿tienen esta blusa?" } },
        { id: "w.image", type: "image", image: { id: "M-IMG", mime_type: "image/jpeg", caption: "esta" } },
        { id: "w.video", type: "video", video: { id: "M-VID", mime_type: "video/mp4" } },
        { id: "w.voice", type: "audio", audio: { id: "M-VOICE", mime_type: "audio/ogg; codecs=opus", voice: true } },
        { id: "w.audio", type: "audio", audio: { id: "M-AUDIO", mime_type: "audio/mpeg" } },
        { id: "w.doc", type: "document", document: { id: "M-DOC", mime_type: "application/pdf", filename: "lista.pdf" } },
        { id: "w.sticker", type: "sticker", sticker: { id: "M-STK", mime_type: "image/webp" } },
        { id: "w.loc", type: "location", location: { latitude: 14.07, longitude: -87.19, name: "Mi casa" } },
        { id: "w.card", type: "contacts", contacts: [{ name: { formatted_name: "Luis" }, phones: [{ phone: "+504 9999-0000" }] }] },
      ),
    );
    await flushAfter();

    const conversation = rows("conversations").find((c) => c.channel_id === "ch-wa")!;
    expect(conversation.status).toBe("open");
    expect(new Date(conversation.window_expires_at as string).getTime()).toBeGreaterThan(Date.now());
    // Chat lists them oldest first: the same order the customer sent them.
    const chat = [...messages()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    expect(chat.map((m) => m.body)).toEqual([
      "Hola, ¿tienen esta blusa?",
      "📷 esta",
      "🎥 Video",
      "🎤 Nota de voz",
      "🎵 Audio",
      "📄 lista.pdf",
      "Sticker",
      "📍 Mi casa",
      "👤 Luis",
    ]);
    // Postgres orders ties at random: every message needs its own instant.
    const times = chat.map((m) => new Date(m.created_at as string).getTime());
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    // ...and stays inside the second Meta stamped it with.
    expect(times[0]).toBeGreaterThanOrEqual(T0 * 1000);
    expect(times.at(-1)).toBeLessThan((T0 + 1) * 1000);
    expect(state.mediaJobs.map((j) => [j.externalMessageId, j.kind])).toEqual([
      ["w.image", "image"],
      ["w.video", "video"],
      ["w.voice", "voice"],
      ["w.audio", "audio"],
      ["w.doc", "document"],
      ["w.sticker", "sticker"],
      ["w.loc", "location"],
      ["w.card", "contacts"],
    ]);
    // chekelin hears about the batch once.
    expect(state.chekelin).toHaveLength(1);
  });

  it("the business answers with a quote, a voice note and a reaction; ticks only move forward; a refusal says why", async () => {
    const { sendChatMessage, reactToMessage, markConversationRead } = await import("@/app/(app)/chat/actions");
    await toWhatsApp(
      fromCustomer(
        { id: "w.photo", type: "image", image: { id: "M1", caption: "¿precio?" } },
        { id: "w.note", type: "audio", audio: { id: "M2", voice: true } },
      ),
    );
    const conversationId = byExternal("w.photo").conversation_id as string;

    // Seen: blue ticks on the customer's phone, unread cleared in cheke.
    await markConversationRead(conversationId);
    expect(graphMessages()[0]).toMatchObject({ status: "read", message_id: "w.note" });
    expect(messages().filter((m) => m.direction === "in").every((m) => m.status === "read")).toBe(true);

    // Quoting the photo.
    const text = await sendChatMessage(conversationId, "L 450", null, byExternal("w.photo").id as string);
    expect(text.error).toBeUndefined();
    expect(graphMessages().at(-1)).toMatchObject({ type: "text", text: { body: "L 450" }, context: { message_id: "w.photo" } });
    const replyRow = messages().find((m) => m.id === text.message!.id)!;
    expect(replyRow.external_message_id).toBeTruthy();

    // A voice note, quoting the customer's voice note.
    const voice = await sendFromComposer(conversationId, { kind: "voice", mime: "audio/webm" }, { replyToId: byExternal("w.note").id as string });
    expect(voice.error).toBeUndefined();
    expect(graphMessages().at(-1)).toMatchObject({ type: "audio", audio: { voice: true }, context: { message_id: "w.note" } });
    const voiceRow = messages().find((m) => m.id === voice.message!.id)!;
    expect(voiceRow).toMatchObject({ direction: "out", media_kind: "voice", reply_to_id: byExternal("w.note").id });

    // ❤️ on the customer's photo.
    expect(await reactToMessage(byExternal("w.photo").id as string, "❤️")).toEqual({ reaction: "❤️" });
    expect(graphMessages().at(-1)).toMatchObject({ type: "reaction", reaction: { message_id: "w.photo", emoji: "❤️" } });

    // Ticks: delivered and read arrive out of order; read wins.
    const replyId = replyRow.external_message_id as string;
    await toWhatsApp(statuses({ id: replyId, status: "read" }, { id: replyId, status: "delivered" }, { id: replyId, status: "sent" }));
    expect(byExternal(replyId).status).toBe("read");

    // The voice note is refused by WhatsApp: Chat says why in Spanish.
    const voiceId = voiceRow.external_message_id as string;
    await toWhatsApp(statuses({ id: voiceId, status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] }));
    expect(byExternal(voiceId)).toMatchObject({ status: "failed", error_code: 131026 });
    expect(byExternal(voiceId).error_reason).toBeTruthy();
  });

  it("the customer reacts to, quotes, edits and deletes; the phone (Coexistencia) shows up as the business", async () => {
    const { sendChatMessage } = await import("@/app/(app)/chat/actions");
    await toWhatsApp(fromCustomer({ id: "w.q", type: "text", text: { body: "quiero 2" } }));
    const conversationId = byExternal("w.q").conversation_id as string;
    const sent = await sendChatMessage(conversationId, "Listo, son L 900");
    const ours = messages().find((m) => m.id === sent.message!.id)!;
    const ourId = ours.external_message_id as string;

    await toWhatsApp(fromCustomer({ id: "w.react", type: "reaction", reaction: { message_id: ourId, emoji: "👍" } }));
    await toWhatsApp(fromCustomer({ id: "w.reply", type: "text", text: { body: "gracias" }, context: { from: CUSTOMER, id: ourId } }));
    await toWhatsApp(fromCustomer({ id: "w.edit", type: "edit", edit: { original_message_id: "w.q", message: { type: "text", text: { body: "quiero 3" } } } }));
    await toWhatsApp(fromCustomer({ id: "w.gone", type: "text", text: { body: "oops" } }));
    await toWhatsApp(fromCustomer({ id: "w.del", type: "revoke", revoke: { original_message_id: "w.gone" } }));
    // Coexistencia: the business answered from the WhatsApp Business app.
    await toWhatsApp(wa({ message_echoes: [{ from: "PN1", to: CUSTOMER, id: "w.echo", timestamp: String(T0 + 30), type: "image", image: { id: "M-E" } }] }));
    await flushAfter();

    expect(byExternal(ourId).reaction_in).toBe("👍");
    expect(byExternal("w.reply").reply_to_id).toBe(ours.id);
    expect(byExternal("w.q")).toMatchObject({ body: "quiero 3" });
    expect(byExternal("w.gone")).toMatchObject({ body: "Mensaje eliminado" });
    expect(byExternal("w.echo")).toMatchObject({ direction: "out", source: "phone", body: "📷 Foto", conversation_id: conversationId });
    expect(state.mediaJobs.map((j) => j.externalMessageId)).toContain("w.echo");
  });

  it("after 24 h nothing but a Plantilla goes out: text, voice notes and reactions are refused before Meta is called", async () => {
    const { sendChatMessage, reactToMessage } = await import("@/app/(app)/chat/actions");
    await toWhatsApp(fromCustomer({ id: "w.old", type: "text", text: { body: "hola" } }));
    const conversation = rows("conversations").find((c) => c.channel_id === "ch-wa")!;
    conversation.window_expires_at = new Date(Date.now() - HOUR).toISOString();
    state.graph = [];

    expect((await sendChatMessage(conversation.id as string, "¿sigue interesada?")).error).toMatch(/plantilla/);
    expect((await sendFromComposer(conversation.id as string, { kind: "voice", mime: "audio/webm" })).error).toMatch(/plantilla/);
    expect((await reactToMessage(byExternal("w.old").id as string, "👍")).error).toMatch(/plantilla/);
    expect(state.graph).toHaveLength(0);
    expect(messages()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Instagram and Messenger: whole conversations
// ---------------------------------------------------------------------------

const metaEvent = (object: "instagram" | "page", accountId: string, events: Array<Record<string, unknown>>) => ({
  object,
  entry: [{ id: accountId, time: Date.now(), messaging: events }],
});
const igFrom = (event: Record<string, unknown>, at = Date.now() - 60_000) => ({ sender: { id: "IGSID1" }, recipient: { id: "IG1" }, timestamp: at, ...event });
const fbFrom = (event: Record<string, unknown>, at = Date.now() - 60_000) => ({ sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: at, ...event });

describe("Instagram and Messenger: whole conversations", () => {
  it("Instagram: text, photo, voice note, video, file, shared post and location all arrive, with their files queued", async () => {
    await toMeta(
      metaEvent("instagram", "IG1", [
        igFrom({ message: { mid: "i.text", text: "hola" } }),
        igFrom({ message: { mid: "i.img", attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }] } }),
        igFrom({ message: { mid: "i.voice", attachments: [{ type: "audio", payload: { url: "https://cdn/x.mp4" } }] } }),
        igFrom({ message: { mid: "i.video", attachments: [{ type: "video", payload: { url: "https://cdn/v.mp4" } }] } }),
        igFrom({ message: { mid: "i.file", attachments: [{ type: "file", payload: { url: "https://cdn/cotizacion.pdf" } }] } }),
        igFrom({ message: { mid: "i.share", attachments: [{ type: "share", payload: { url: "https://instagram.com/p/1" } }] } }),
      ]),
    );
    await flushAfter();
    expect(messages().map((m) => m.body)).toEqual(["hola", "📷 Foto", "🎤 Nota de voz", "🎥 Video", "📄 Archivo", "🔗 Publicación compartida"]);
    expect(state.mediaJobs.map((j) => j.kind)).toEqual(["image", "audio", "video", "document"]);
  });

  it("Messenger: several photos in one message are all kept, not just the first", async () => {
    await toMeta(
      metaEvent("page", "PAGE1", [
        fbFrom({
          message: {
            mid: "f.album",
            attachments: [
              { type: "image", payload: { url: "https://cdn/1.jpg" } },
              { type: "image", payload: { url: "https://cdn/2.jpg" } },
              { type: "image", payload: { url: "https://cdn/3.jpg" } },
            ],
          },
        }),
      ]),
    );
    await flushAfter();
    expect(messages().map((m) => m.body)).toEqual(["📷 Foto", "📷 Foto", "📷 Foto"]);
    expect(state.mediaJobs).toHaveLength(3);
    expect(new Set(state.mediaJobs.map((j) => j.externalMessageId)).size).toBe(3);
  });

  it("Instagram 24 h – 7 days: a person's voice note and photo go out with the HUMAN_AGENT tag", async () => {
    await toMeta(metaEvent("instagram", "IG1", [igFrom({ message: { mid: "i.q", text: "¿envían a SPS?" } })]));
    const conversation = rows("conversations").find((c) => c.channel_id === "ch-ig")!;
    conversation.window_expires_at = new Date(Date.now() - 2 * 24 * HOUR).toISOString(); // last message 3 days ago

    const voice = await sendFromComposer(conversation.id as string, { kind: "voice", mime: "audio/webm" });
    const photo = await sendFromComposer(conversation.id as string, { kind: "image", mime: "image/jpeg", filename: "a.jpg" });
    expect(voice.error ?? voice.sendError).toBeUndefined();
    expect(photo.error ?? photo.sendError).toBeUndefined();
    const sends = state.graph.filter((c) => c.body).map((c) => c.body as Record<string, unknown>);
    expect(sends).toHaveLength(2);
    for (const send of sends) expect(send).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
    expect(sends[0]).toMatchObject({ message: { attachment: { type: "audio" } } });
    expect(sends[1]).toMatchObject({ message: { attachment: { type: "image" } } });
  });

  it("Messenger: delivery and read receipts move the ticks, including the watermark-only kind", async () => {
    const { sendChatMessage } = await import("@/app/(app)/chat/actions");
    await toMeta(metaEvent("page", "PAGE1", [fbFrom({ message: { mid: "f.q", text: "hola" } })]));
    const conversationId = byExternal("f.q").conversation_id as string;
    const sent = await sendChatMessage(conversationId, "¡Hola! ¿En qué te ayudo?");
    const row = messages().find((m) => m.id === sent.message!.id)!;
    expect(row.status).toBe("sent");

    // Older Messenger clients send only a watermark (no message ids).
    await toMeta(metaEvent("page", "PAGE1", [fbFrom({ delivery: { watermark: Date.now() + 1000 } }, Date.now() + 1000)]));
    expect(messages().find((m) => m.id === row.id)!.status).toBe("delivered");
    await toMeta(metaEvent("page", "PAGE1", [fbFrom({ read: { watermark: Date.now() + 2000 } }, Date.now() + 2000)]));
    expect(messages().find((m) => m.id === row.id)!.status).toBe("read");
  });

  it("Instagram: the business replying from the Instagram app shows in the chat once", async () => {
    await toMeta(metaEvent("instagram", "IG1", [igFrom({ message: { mid: "i.c", text: "precio?" } })]));
    await flushAfter();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      await toMeta(
        metaEvent("instagram", "IG1", [
          { sender: { id: "IG1" }, recipient: { id: "IGSID1" }, timestamp: Date.now(), message: { mid: "i.echo", text: "L 300", is_echo: true } },
        ]),
      );
      const pending = flushAfter();
      await vi.runAllTimersAsync();
      await pending;
    } finally {
      vi.useRealTimers();
    }
    expect(byExternal("i.echo")).toMatchObject({ direction: "out", source: "meta_app", body: "L 300" });
  });
});

// ---------------------------------------------------------------------------
// Reintentar: a failed send goes out again from the same bubble
// ---------------------------------------------------------------------------

describe("Reintentar a failed message", () => {
  const metaDown = { status: 500, body: { error: { code: 1, message: "An unknown error occurred" } } };

  it("a text that failed is sent again and its bubble turns into a normal sent message", async () => {
    const { sendChatMessage, retryMessage } = await import("@/app/(app)/chat/actions");
    await toWhatsApp(fromCustomer({ id: "w.r1", type: "text", text: { body: "¿precio?" } }));
    const conversationId = byExternal("w.r1").conversation_id as string;
    state.graphReplies.push(metaDown);
    const first = await sendChatMessage(conversationId, "L 450", null, byExternal("w.r1").id as string);
    expect(first.sendError).toBeTruthy();
    const failedId = first.message!.id;
    expect(messages().find((m) => m.id === failedId)!.status).toBe("failed");

    const retried = await retryMessage(failedId);
    expect(retried.error).toBeUndefined();
    expect(retried.sendError).toBeUndefined();
    expect(retried.message).toMatchObject({ id: failedId, status: "sent", error_reason: null });
    // Same text, still quoting the customer's question.
    expect(graphMessages().at(-1)).toMatchObject({ type: "text", text: { body: "L 450" }, context: { message_id: "w.r1" } });
    const row = messages().find((m) => m.id === failedId)!;
    expect(row).toMatchObject({ status: "sent", error_code: null });
    expect(row.external_message_id).toBeTruthy();
    expect(messages().filter((m) => m.direction === "out")).toHaveLength(1);
  });

  it("a voice note that failed is sent again as a voice note", async () => {
    const { retryMessage } = await import("@/app/(app)/chat/actions");
    await toWhatsApp(fromCustomer({ id: "w.r2", type: "text", text: { body: "mandame audio" } }));
    const conversationId = byExternal("w.r2").conversation_id as string;
    state.graphReplies.push({ status: 200, body: { id: "media-1" } }, metaDown);
    const first = await sendFromComposer(conversationId, { kind: "voice", mime: "audio/webm" });
    expect(first.sendError).toBeTruthy();

    const retried = await retryMessage(first.message!.id as string);
    expect(retried.message).toMatchObject({ status: "sent", media_kind: "voice" });
    expect(graphMessages().at(-1)).toMatchObject({ type: "audio", audio: { voice: true } });
  });

  it("once the 24 h window closed, Reintentar explains it instead of calling Meta", async () => {
    const { sendChatMessage, retryMessage } = await import("@/app/(app)/chat/actions");
    await toWhatsApp(fromCustomer({ id: "w.r3", type: "text", text: { body: "hola" } }));
    const conversation = rows("conversations").find((c) => c.channel_id === "ch-wa")!;
    state.graphReplies.push(metaDown);
    const first = await sendChatMessage(conversation.id as string, "hola!");
    conversation.window_expires_at = new Date(Date.now() - HOUR).toISOString();
    const calls = state.graph.length;

    const retried = await retryMessage(first.message!.id);
    expect(retried.error).toMatch(/plantilla/);
    expect(state.graph).toHaveLength(calls);
    expect(messages().find((m) => m.id === first.message!.id)!.status).toBe("failed");
  });
});
