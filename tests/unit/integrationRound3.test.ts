import { createHmac, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memoryDb";
import type { SellerDecision } from "@/lib/ai";
import type { CurrentBusiness } from "@/lib/stores";

// QA ronda 3: the features merged in #73–#78 working *together*, through
// cheke's public seams: Meta's signed webhooks, Chat's server actions and
// /api/chat/media, the template sender, "Lo que chekelin sabe", and the REAL
// chekelin (src/lib/bot.ts handleInboundMessage → runSeller). Only the model
// is replaced: decideSeller returns the decision each test sets, so no
// Anthropic call is ever made. One in-memory database plays both the
// signed-in client and the service role; Meta's Graph API is a fake `fetch`.
const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("./memoryDb").memoryDb>,
  afterTasks: [] as Array<() => unknown>,
  graph: [] as Array<{ url: string; body: unknown }>,
  graphReplies: [] as Array<{ status: number; body: unknown }>,
  decisions: [] as Array<Partial<SellerDecision>>,
  sellerCalls: [] as Array<{ history: Array<{ direction: string; body: string | null }> }>,
  pushes: [] as Array<{ title: string }>,
  business: null as CurrentBusiness | null,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => state.afterTasks.push(task),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.db.client }));
vi.mock("@/lib/business", async () => {
  const stores = await vi.importActual<typeof import("@/lib/stores")>("@/lib/stores");
  return { ...stores, getCurrentBusiness: async () => state.business };
});
// The model: never called. Each test says what chekelin "decides".
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  decideSeller: async (args: { history: Array<{ direction: string; body: string | null }> }) => {
    state.sellerCalls.push({ history: args.history });
    const next = state.decisions.shift();
    if (!next) return { error: "no decision queued" };
    return {
      decision: {
        messages: [],
        productRefs: [],
        sendLocation: false,
        action: "none",
        handoffReason: "ninguna",
        teamSummary: "",
        order: { items: [], shipping_hnl: 0, total_hnl: 0, customer_name: "", city: "", address: "", delivery_method: "" },
        ...next,
      } as SellerDecision,
    };
  },
  decideSimpleFact: async () => ({ decision: null }),
}));
// chekelin's "escribiendo…" pauses (3–10 s) don't matter here.
vi.mock("@/lib/chekelinState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chekelinState")>()),
  humanDelayMs: () => 0,
  secondMessageDelayMs: () => 0,
}));
vi.mock("@/lib/push", () => ({
  sendPushToPeople: vi.fn(async (_s: unknown, _b: unknown, _st: unknown, _p: unknown, n: { title: string }) => {
    state.pushes.push(n);
  }),
  notifyConversation: vi.fn(async (_s: unknown, _c: unknown, n: { title: string }) => {
    state.pushes.push(n);
  }),
}));
vi.mock("@/lib/messageMedia", () => ({ saveMessageMedia: async () => undefined, toM4a: async () => Buffer.from("m4a") }));
vi.mock("@/lib/voiceNote", () => ({ toVoiceNote: async () => Buffer.from("ogg-opus") }));
vi.mock("@/lib/videoConvert", () => ({ toMp4: async () => Buffer.from("mp4") }));
vi.mock("@/lib/channelHealth", () => ({ markChannelNeedsReconnect: vi.fn(), regeneratePageToken: vi.fn(async () => null) }));

import { NextRequest } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { countUnread } from "@/lib/unread";
import { POST as whatsappWebhook } from "@/app/api/whatsapp/webhook/route";
import { POST as metaWebhook } from "@/app/api/meta/webhook/route";
import { POST as chatMedia } from "@/app/api/chat/media/route";
import { prepareChatUpload } from "@/app/(app)/chat/mediaActions";
import {
  markConversationRead,
  reactToMessage,
  retryMessage,
  sendChatMessage,
  sendStoreLocation,
  simulateInboundMessage,
} from "@/app/(app)/chat/actions";
import { sendWhatsAppTemplate } from "@/app/(app)/chat/templateActions";
import { submitTemplateForApproval } from "@/app/(app)/templates/whatsappActions";
import { saveChekelinInfo } from "@/app/(app)/chekelin/actions";
import { EMPTY_CHEKELIN_INFO } from "@/lib/types";

const SECRET = "app-secret";
const KEY = randomBytes(32).toString("base64");
const BIZ = "biz-1";
const STORE = "store-1";
const HOUR = 60 * 60 * 1000;
const CUSTOMER = "50499223843";

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
const messages = () => [...rows("messages")].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
const byExternal = (id: string) => rows("messages").find((m) => m.external_message_id === id)!;
const graphSends = () => state.graph.filter((c) => c.url.endsWith("/messages") && c.body).map((c) => c.body as Record<string, unknown>);

let clockSeconds = Math.floor(Date.now() / 1000) - 600;
const wa = (value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN1" }, ...value } }] }],
});
// Each customer message one second after the previous one.
const fromCustomer = (message: Record<string, unknown>) =>
  wa({
    contacts: [{ wa_id: CUSTOMER, profile: { name: "Ana" } }],
    messages: [{ from: CUSTOMER, timestamp: String(++clockSeconds), ...message }],
  });

// The customer writes on WhatsApp and chekelin (real) answers.
async function customerSays(id: string, message: Record<string, unknown>) {
  await toWhatsApp(fromCustomer({ id, ...message }));
  await flushAfter();
  return byExternal(id);
}

const LOCATION = {
  location_address: "Col. Palmira, frente al parque",
  location_maps_url: "https://www.google.com/maps/@14.0723,-87.1921,17z",
  location_lat: 14.0723,
  location_lng: -87.1921,
};

function seed(extra: { storeArchived?: boolean } = {}) {
  state.db = memoryDb({
    businesses: [{ id: BIZ, name: "Luna", plan: "plus", is_demo: false }],
    stores: [{ id: STORE, business_id: BIZ, name: "Tienda Luna", archived_at: extra.storeArchived ? new Date().toISOString() : null, chekelin_off_until: null }],
    store_chekelin_info: [{ store_id: STORE, business_id: BIZ, ...EMPTY_CHEKELIN_INFO, payment_methods: "Transferencia BAC", ...LOCATION }],
    channels: [
      { id: "ch-wa", business_id: BIZ, store_id: STORE, type: "whatsapp", status: "connected", external_id: "PN1", waba_id: "WABA1", page_id: null, access_token_encrypted: encryptSecret("wa-token") },
      { id: "ch-ig", business_id: BIZ, store_id: STORE, type: "instagram", status: "connected", external_id: "IG1", page_id: "PAGE1", access_token_encrypted: encryptSecret("page-token") },
      { id: "ch-sample", business_id: BIZ, store_id: STORE, type: "whatsapp", status: "connected", external_id: null, page_id: null, access_token_encrypted: null },
    ],
    contacts: [{ id: "k-sample", business_id: BIZ, name: "María (ejemplo)", phone: "50499990000" }],
    conversations: [
      { id: "c-sample", business_id: BIZ, store_id: STORE, contact_id: "k-sample", channel_id: "ch-sample", status: "open", bot_enabled: true, chekelin_replies: 0, stage: "nuevo", window_expires_at: new Date(Date.now() - 24 * HOUR).toISOString(), created_at: new Date(Date.now() - 48 * HOUR).toISOString() },
    ],
    members: [{ business_id: BIZ, user_id: "owner-1", role: "owner", created_at: "2026-01-01T00:00:00Z" }],
  });
}

const OPEN_STORE = { id: STORE, name: "Tienda Luna", archived: false };
function signedInAs(role: "owner" | "manager" | "agent"): CurrentBusiness {
  return {
    id: BIZ,
    name: "Luna",
    plan: "plus",
    role,
    userId: `${role}-1`,
    allStores: [OPEN_STORE],
    stores: [OPEN_STORE],
    archivedStores: [],
    multiStore: false,
    selected: STORE,
    selectedStore: OPEN_STORE,
    scopeStoreIds: [STORE],
  };
}

beforeEach(() => {
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
  vi.stubEnv("CHANNEL_TOKEN_KEY", KEY);
  vi.stubEnv("META_SYSTEM_USER_TOKEN", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  state.afterTasks = [];
  state.graph = [];
  state.graphReplies = [];
  state.decisions = [];
  state.sellerCalls = [];
  state.pushes = [];
  state.business = signedInAs("owner");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      state.graph.push({ url: String(url), body });
      const n = state.graph.length;
      const next = state.graphReplies.shift() ?? { status: 200, body: { id: `media-${n}`, success: true, messages: [{ id: `wamid.out${n}` }], message_id: `mid.out${n}` } };
      return new Response(JSON.stringify(next.body), { status: next.status });
    }),
  );
  seed();
});

// ---------------------------------------------------------------------------
// chekelin × Ubicación × Responder
// ---------------------------------------------------------------------------

describe("chekelin sends the Tienda's location, the customer quotes it", () => {
  it("WhatsApp: chekelin's map pin goes out as a location message, and the customer's quote links to it", async () => {
    state.decisions.push({ messages: ["¡Claro! Aquí te dejo la ubicación 📍"], sendLocation: true });
    const ask = await customerSays("w.donde", { type: "text", text: { body: "¿dónde están ubicados?" } });
    const conversationId = ask.conversation_id as string;

    const sends = graphSends().filter((b) => b.type !== undefined || b.status === undefined);
    expect(sends.map((b) => b.type)).toEqual(["text", "location"]);
    expect(sends[1]).toMatchObject({ location: { latitude: 14.0723, longitude: -87.1921, name: "Tienda Luna", address: "Col. Palmira, frente al parque" } });
    const pin = messages().find((m) => m.media_kind === "location" && m.direction === "out")!;
    expect(pin).toMatchObject({ is_bot: true, conversation_id: conversationId, media_info: { latitude: 14.0723, longitude: -87.1921 } });
    expect(pin.external_message_id).toBeTruthy();

    // "¿Este es el de la Palmira?" quoting chekelin's pin.
    state.decisions.push({ messages: ["¡Sí, ese mismo! Te esperamos 🙌"] });
    const quote = await customerSays("w.quote", { type: "text", text: { body: "¿Este es el de la Palmira?" }, context: { from: CUSTOMER, id: pin.external_message_id } });
    expect(quote.reply_to_id).toBe(pin.id);
    // chekelin read the conversation with its own pin in it.
    expect(state.sellerCalls.at(-1)!.history.map((m) => m.body)).toContain(pin.body);
  });

  it("Instagram: chekelin sends the address with the Maps link as text (Instagram has no location message)", async () => {
    state.decisions.push({ messages: ["Estamos en la Palmira 😊"], sendLocation: true });
    await toMeta({ object: "instagram", entry: [{ id: "IG1", time: Date.now(), messaging: [{ sender: { id: "IGSID1" }, recipient: { id: "IG1" }, timestamp: Date.now() - 1000, message: { mid: "i.donde", text: "¿dónde quedan?" } }] }] });
    await flushAfter();
    const texts = state.graph.filter((c) => (c.body as { message?: { text?: string } })?.message?.text).map((c) => (c.body as { message: { text: string } }).message.text);
    expect(texts).toEqual(["Estamos en la Palmira 😊", "📍 Tienda Luna\nCol. Palmira, frente al parque\nhttps://www.google.com/maps/@14.0723,-87.1921,17z"]);
    expect(messages().some((m) => m.media_kind === "location")).toBe(false);
  });

  it("a person resends chekelin's pin with «Ubicación» after it failed, and Reintentar sends the pin again", async () => {
    state.decisions.push({ messages: ["Te mando la ubicación"], sendLocation: true });
    // chekelin's text goes out, its pin is refused by Meta.
    state.graphReplies.push({ status: 200, body: { success: true } }, { status: 200, body: { messages: [{ id: "wamid.t1" }] } }, { status: 500, body: { error: { code: 1, message: "An unknown error occurred" } } });
    await customerSays("w.loc1", { type: "text", text: { body: "ubicación porfa" } });
    const pin = messages().find((m) => m.media_kind === "location")!;
    expect(pin.status).toBe("failed");

    const retried = await retryMessage(pin.id as string);
    expect(retried.error ?? retried.sendError).toBeUndefined();
    expect(graphSends().at(-1)).toMatchObject({ type: "location", location: { latitude: 14.0723, longitude: -87.1921, name: "Tienda Luna" } });
    expect(rows("messages").find((m) => m.id === pin.id)).toMatchObject({ status: "sent", media_kind: "location" });
  });
});

// ---------------------------------------------------------------------------
// Plantilla after 24 h × reply window × chekelin
// ---------------------------------------------------------------------------

const APPROVED = {
  id: "wt-1",
  business_id: BIZ,
  store_id: STORE,
  channel_id: "ch-wa",
  name: "seguimiento",
  language: "es",
  status: "APPROVED",
  category: "UTILITY",
  components: [{ type: "BODY", text: "Hola {{1}}, ¿te interesa todavía la blusa?" }],
};

describe("a Plantilla after 24 h reopens the conversation", () => {
  it("text is refused, the Plantilla goes out, and the customer's answer opens the window again for everything", async () => {
    state.decisions.push({ messages: ["¡Hola! Sí la tenemos en M, L 450"] });
    const first = await customerSays("w.old", { type: "text", text: { body: "¿precio de la blusa?" } });
    const conversationId = first.conversation_id as string;
    const conversation = rows("conversations").find((c) => c.id === conversationId)!;
    conversation.window_expires_at = new Date(Date.now() - HOUR).toISOString();
    rows("whatsapp_templates").push(APPROVED);

    expect((await sendChatMessage(conversationId, "¿sigues interesada?")).error).toMatch(/plantilla/);
    expect((await sendStoreLocation(conversationId)).error).toMatch(/plantilla/);

    const sent = await sendWhatsAppTemplate(conversationId, "wt-1", { "1": "Ana" });
    expect(sent.error ?? sent.sendError).toBeUndefined();
    expect(graphSends().at(-1)).toMatchObject({ type: "template", template: { name: "seguimiento", language: { code: "es" } } });
    expect(sent.message).toMatchObject({ direction: "out", body: "Hola Ana, ¿te interesa todavía la blusa?" });
    expect(byExternal(String(rows("messages").find((m) => m.id === sent.message!.id)!.external_message_id)).id).toBe(sent.message!.id);
    // A Plantilla doesn't open the window: only the customer can.
    expect(new Date(conversation.window_expires_at as string).getTime()).toBeLessThan(Date.now());

    // The customer answers, quoting the Plantilla.
    state.decisions.push({ messages: ["¡Qué bueno! ¿En qué talla la quieres?"] });
    const answer = await customerSays("w.back", {
      type: "text",
      text: { body: "sí, todavía la quiero" },
      context: { from: CUSTOMER, id: rows("messages").find((m) => m.id === sent.message!.id)!.external_message_id },
    });
    expect(answer.reply_to_id).toBe(sent.message!.id);
    expect(new Date(conversation.window_expires_at as string).getTime()).toBeGreaterThan(Date.now() + 23 * HOUR);

    // Everything works again: text, Ubicación and a reaction.
    expect((await sendChatMessage(conversationId, "Te la aparto")).error).toBeUndefined();
    expect((await sendStoreLocation(conversationId)).error).toBeUndefined();
    expect((await reactToMessage(answer.id as string, "❤️")).error).toBeUndefined();
  });

  it("a sample chat (Modo prueba): a typed test message reopens the window and the real chekelin answers without sending anything", async () => {
    state.decisions.push({ messages: ["¡Hola María! La blusa cuesta L 450"] });
    const result = await simulateInboundMessage("c-sample", "precio de la blusa");
    expect(result.error).toBeUndefined();
    expect(result.reply).toMatchObject({ direction: "out", is_bot: true, body: "¡Hola María! La blusa cuesta L 450" });
    expect(state.graph).toHaveLength(0);
    expect(rows("conversations").find((c) => c.id === "c-sample")).toMatchObject({ stage: "cotizacion" });
  });
});

// ---------------------------------------------------------------------------
// Modo prueba × voice notes × chekelin
// ---------------------------------------------------------------------------

async function recordAsCustomer(conversationId: string) {
  const bytes = Buffer.from("voice");
  const prep = await prepareChatUpload(conversationId, { kind: "voice", mime: "audio/webm", size: bytes.length }, { asCustomer: true });
  if (prep.error) return { error: prep.error } as { error?: string; message?: Record<string, unknown>; reply?: Record<string, unknown>; sendError?: string };
  await state.db.client.storage.from("message-media").uploadToSignedUrl(prep.path!, prep.token!, bytes, { contentType: "audio/webm" });
  const res = await chatMedia(
    new Request("http://cheke.test/api/chat/media", {
      method: "POST",
      body: JSON.stringify({ conversationId, kind: "voice", path: prep.path, duration: 3, asCustomer: true }),
    }),
  );
  return (await res.json()) as { error?: string; message?: Record<string, unknown>; reply?: Record<string, unknown>; sendError?: string };
}

describe("Modo prueba: a voice note as the customer wakes the real chekelin", () => {
  it("chekelin answers the test voice note on screen, nothing goes to Meta, and the chat counts it as unread until opened", async () => {
    state.decisions.push({ messages: ["¡Hola! Te escuché, ¿qué talla buscas?"] });
    const result = await recordAsCustomer("c-sample");
    expect(result.error).toBeUndefined();
    expect(result.message).toMatchObject({ direction: "in", media_kind: "voice" });
    expect(result.reply).toMatchObject({ is_bot: true, body: "¡Hola! Te escuché, ¿qué talla buscas?" });
    expect(state.graph).toHaveLength(0);
    // chekelin read the voice note (no transcription configured: its text).
    expect(state.sellerCalls[0].history.at(-1)).toMatchObject({ direction: "in", body: "🎤 Nota de voz" });
    // chekelin's answer doesn't clear "No leídos": a person still has to look.
    expect(countUnread(messages() as never)).toBe(1);
  });

  it("when chekelin can't answer (model down), the test voice note still saves and says why", async () => {
    const result = await recordAsCustomer("c-sample");
    expect(result.message).toMatchObject({ direction: "in", media_kind: "voice" });
    expect(result.sendError).toMatch(/chekelin no pudo responder/);
    expect(state.graph).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// No leídos × chekelin × Reintentar
// ---------------------------------------------------------------------------

describe("No leídos with chekelin's replies and Reintentar", () => {
  it("chekelin answering keeps the badge; a person's failed reply that is retried clears it; opening the chat sends blue ticks once", async () => {
    state.decisions.push({ messages: ["¡Hola! ¿Qué buscas?"] }, { messages: ["Tenemos M y L"] });
    const a = await customerSays("w.u1", { type: "text", text: { body: "hola" } });
    await customerSays("w.u2", { type: "text", text: { body: "¿tallas?" } });
    const conversationId = a.conversation_id as string;
    expect(messages().filter((m) => m.is_bot)).toHaveLength(2);
    expect(countUnread(messages() as never)).toBe(2);

    state.graphReplies.push({ status: 500, body: { error: { code: 1, message: "An unknown error occurred" } } });
    const failed = await sendChatMessage(conversationId, "Te atiendo yo, Ana");
    expect(failed.sendError).toBeTruthy();
    const retried = await retryMessage(failed.message!.id);
    expect(retried.message).toMatchObject({ status: "sent" });
    expect(countUnread(messages() as never)).toBe(0);

    state.graph = [];
    await markConversationRead(conversationId);
    await markConversationRead(conversationId);
    expect(graphSends().filter((b) => b.status === "read")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tienda archivada × the new send types
// ---------------------------------------------------------------------------

describe("an archived Tienda is read-only for every new send type", () => {
  it("Ubicación, Plantilla, Reintentar, reactions, files and Modo prueba are all refused; nothing reaches Meta", async () => {
    rows("contacts").push({ id: "k-ana", business_id: BIZ, name: "Ana", phone: CUSTOMER });
    rows("conversations").push({ id: "c-ana", business_id: BIZ, store_id: STORE, contact_id: "k-ana", channel_id: "ch-wa", status: "open", bot_enabled: true, window_expires_at: new Date(Date.now() + HOUR).toISOString() });
    rows("messages").push(
      { id: "m-in", conversation_id: "c-ana", business_id: BIZ, store_id: STORE, direction: "in", body: "hola", external_message_id: "w.a1", status: "sent", created_at: new Date(Date.now() - 60_000).toISOString() },
      { id: "m-failed", conversation_id: "c-ana", business_id: BIZ, store_id: STORE, direction: "out", body: "hola!", status: "failed", is_bot: false, created_at: new Date().toISOString() },
    );
    rows("whatsapp_templates").push(APPROVED);
    rows("stores")[0].archived_at = new Date().toISOString();

    const READ_ONLY = /archivada/i;
    expect((await sendChatMessage("c-ana", "hola")).error).toMatch(READ_ONLY);
    expect((await sendStoreLocation("c-ana")).error).toMatch(READ_ONLY);
    expect((await sendWhatsAppTemplate("c-ana", "wt-1", { "1": "Ana" })).error).toMatch(READ_ONLY);
    expect((await retryMessage("m-failed")).error).toMatch(READ_ONLY);
    expect((await reactToMessage("m-in", "👍")).error).toMatch(READ_ONLY);
    expect((await simulateInboundMessage("c-sample", "hola")).error).toMatch(READ_ONLY);
    expect((await recordAsCustomer("c-sample")).error).toMatch(READ_ONLY);
    expect(state.graph).toHaveLength(0);
    expect(rows("messages")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Agente vs Dueño: Plantillas de WhatsApp and the Tienda's location
// ---------------------------------------------------------------------------

describe("who may send a Plantilla to WhatsApp and change the Tienda's location", () => {
  const submission = { sourceTemplateId: "t-1", channelId: "ch-wa", name: "Seguimiento", category: "UTILITY", body: "Hola {{1}}, ¿sigues interesada?", examples: ["Ana"] };

  it("an Agente can't submit a Plantilla nor change the location; a Dueño can", async () => {
    rows("templates").push({ id: "t-1", business_id: BIZ, title: "Seguimiento", body: "Hola {nombre}" });
    const location = { address: "Col. Kennedy", mapsUrl: "", latitude: 14.05, longitude: -87.17 };

    state.business = signedInAs("agent");
    expect((await submitTemplateForApproval(submission)).error).toMatch(/dueño o un gerente/);
    expect((await saveChekelinInfo(STORE, { ...EMPTY_CHEKELIN_INFO }, location)).error).toMatch(/dueño o el gerente/);
    expect(state.graph).toHaveLength(0);
    expect(rows("store_chekelin_info")[0]).toMatchObject(LOCATION);

    state.business = signedInAs("owner");
    state.graphReplies.push({ status: 200, body: { id: "META-T1", status: "PENDING", category: "UTILITY" } });
    const approval = await submitTemplateForApproval(submission);
    expect(approval.error).toBeUndefined();
    expect(approval.approval).toMatchObject({ name: "seguimiento", status: "PENDING", source_template_id: "t-1" });
    expect((await saveChekelinInfo(STORE, { ...EMPTY_CHEKELIN_INFO, payment_methods: "Transferencia BAC" }, location)).error).toBeUndefined();
    expect(rows("store_chekelin_info")[0]).toMatchObject({ location_address: "Col. Kennedy", location_lat: 14.05, location_lng: -87.17 });
  });

  it("a Gerente of another Tienda can't submit a Plantilla for this Tienda's number", async () => {
    rows("templates").push({ id: "t-1", business_id: BIZ, title: "Seguimiento", body: "Hola {nombre}" });
    const other = { id: "store-2", name: "Norte", archived: false };
    state.business = { ...signedInAs("manager"), allStores: [OPEN_STORE, other], stores: [other], selected: "store-2", selectedStore: other, scopeStoreIds: ["store-2"] };
    expect((await submitTemplateForApproval(submission)).error).toMatch(/dueño o el gerente de esa tienda/);
    expect(state.graph).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Modo prueba × Canales: a real customer's chat stays real after «Desconectar»
// ---------------------------------------------------------------------------

describe("Modo prueba is refused in a real customer's chat even when its Canal has no stored token", () => {
  function realChatOn(channel: Record<string, unknown>) {
    rows("channels").push({ id: "ch-real", business_id: BIZ, store_id: STORE, type: "whatsapp", page_id: null, waba_id: "WABA2", ...channel });
    rows("contacts").push({ id: "k-real", business_id: BIZ, name: "Ana", phone: CUSTOMER });
    rows("conversations").push({ id: "c-real", business_id: BIZ, store_id: STORE, contact_id: "k-real", channel_id: "ch-real", status: "open", bot_enabled: true, window_expires_at: new Date(Date.now() + HOUR).toISOString() });
  }

  it("after «Desconectar» (token cleared, number kept): no fake customer message, no chekelin", async () => {
    realChatOn({ status: "disconnected", external_id: "PN2", access_token_encrypted: null });
    state.decisions.push({ messages: ["hola"] });
    expect((await simulateInboundMessage("c-real", "hola")).error).toMatch(/chats de ejemplo/);
    // Refused before the browser even uploads the file.
    expect((await prepareChatUpload("c-real", { kind: "voice", mime: "audio/webm", size: 5 }, { asCustomer: true })).error).toMatch(/chats de ejemplo/);
    expect((await recordAsCustomer("c-real")).error).toMatch(/chats de ejemplo/);
    expect(rows("messages")).toHaveLength(0);
    expect(state.sellerCalls).toHaveLength(0);
  });

  it("on cheke's WhatsApp test number (token from the server's settings, none stored): refused too", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "PN-TEST");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    realChatOn({ status: "connected", external_id: "PN-TEST", access_token_encrypted: null });
    expect((await simulateInboundMessage("c-real", "hola")).error).toMatch(/chats de ejemplo/);
    expect(rows("messages")).toHaveLength(0);
  });
});
