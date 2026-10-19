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

export { toWhatsApp, toMeta, flushAfter };
