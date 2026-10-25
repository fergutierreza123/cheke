import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memoryDb";

// chekelin's monthly allowance at its seam: a customer message reaches
// handleInboundMessage (what the webhooks call). Under the Plan's limit
// chekelin sells; at the limit the chat goes quietly to the team and the
// Dueños get one notice; on the 1st (Honduras time) chekelin resumes.
// The model, the channel send and the pushes are recorded instead of run.
const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("./memoryDb").memoryDb>,
  modelCalls: 0,
  pushes: [] as Array<{ people: string[]; title: string; body: string; url?: string }>,
  alerts: [] as Array<{ conversationId?: string; title: string }>,
}));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  decideSeller: async () => {
    state.modelCalls++;
    return {
      decision: {
        messages: ["¡Hola! Sí, la blusa está en L 450. ¿De qué talla la ocupás?"],
        productRefs: [],
        sendLocation: false,
        action: "none",
        handoffReason: "ninguna",
        teamSummary: "Pregunta precio de la blusa",
        order: { items: [], customer_name: "", city: "", address: "", delivery_method: "", shipping_hnl: 0, total_hnl: 0 },
      },
      usage: [{ model: "claude-sonnet-5-5", input_tokens: 600, output_tokens: 350, cache_read_tokens: 4000, cache_write_tokens: 0 }],
    };
  },
}));
vi.mock("@/lib/channelSend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/channelSend")>()),
  sendOnChannel: async () => ({ externalMessageId: `wamid.${Math.random()}` }),
  showTyping: async () => {},
}));
vi.mock("@/lib/chekelinState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chekelinState")>()),
  humanDelayMs: () => 0,
  secondMessageDelayMs: () => 0,
}));
vi.mock("@/lib/voiceTranscription", () => ({ waitForVoiceTranscription: async () => {} }));
vi.mock("@/lib/push", () => ({
  sendPushToPeople: async (_: unknown, _b: string, _s: string, people: string[], n: { title: string; body: string; url?: string }) => {
    state.pushes.push({ people, title: n.title, body: n.body, url: n.url });
  },
  notifyConversation: async (_: unknown, _c: unknown, n: { title: string; conversationId?: string }) => {
    state.alerts.push({ conversationId: n.conversationId, title: n.title });
  },
}));

import { handleInboundMessage } from "@/lib/bot";
import { getChekelinUsage } from "@/lib/chekelinAllowance";
import { CHEKELIN_MONTHLY_CONVERSATIONS } from "@/lib/plan";

const BIZ = "biz-1";
const STORE = "store-1";
const OWNER = "owner-1";
const LIMIT = CHEKELIN_MONTHLY_CONVERSATIONS.cheke.included;
// Tuesday 20 October 2026, 2:15 p. m. in Honduras.
const OCTOBER = Date.parse("2026-10-20T20:15:00Z");
const NOVEMBER = Date.parse("2026-11-01T15:00:00Z");

let n = 0;
// A new customer writes to the Tienda's WhatsApp.
function newConversation(): string {
  const id = `conv-${++n}`;
  const now = new Date(Date.now()).toISOString();
  state.db.rows("contacts").push({ id: `contact-${n}`, business_id: BIZ, name: `Cliente ${n}`, phone: `5049999${n}` });
  state.db.rows("conversations").push({
    id,
    business_id: BIZ,
    store_id: STORE,
    contact_id: `contact-${n}`,
    channel_id: "ch-1",
    stage: "nuevo",
    bot_enabled: true,
    handed_off_at: null,
    chekelin_replies: 0,
    last_inbound_at: now,
    window_expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });
  state.db.rows("messages").push({ id: `in-${n}`, conversation_id: id, business_id: BIZ, direction: "in", body: "Hola, ¿precio de la blusa?", created_at: now });
  return id;
}

// chekelin already attended this many other conversations this month.
async function alreadyAttended(count: number) {
  for (let i = 0; i < count; i++) await handleInboundMessage(state.db.client as never, newConversation());
}

const botMessages = (conversationId: string) =>
  state.db.rows("messages").filter((m) => m.conversation_id === conversationId && m.is_bot === true);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCTOBER);
  state.modelCalls = 0;
  state.pushes = [];
  state.alerts = [];
  state.db = memoryDb({
    businesses: [{ id: BIZ, name: "Tienda Luna", plan: "cheke", is_demo: false, chekelin_extra: 0, chekelin_extra_month: null }],
    stores: [{ id: STORE, business_id: BIZ, name: "Centro", archived_at: null, chekelin_off_until: null }],
    channels: [{ id: "ch-1", business_id: BIZ, store_id: STORE, type: "whatsapp", external_id: "pn-1", status: "connected" }],
    members: [{ business_id: BIZ, user_id: OWNER, role: "owner", created_at: "2026-01-01T00:00:00Z" }],
    store_chekelin_info: [{ store_id: STORE, business_id: BIZ, payment_methods: "BAC 123" }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("chekelin under the Plan's monthly limit", () => {
  it("sells, and the conversation counts once this month", async () => {
    const conv = newConversation();
    await handleInboundMessage(state.db.client as never, conv);
    expect(state.modelCalls).toBe(1);
    expect(botMessages(conv).map((m) => m.body)).toEqual(["¡Hola! Sí, la blusa está en L 450. ¿De qué talla la ocupás?"]);

    // The same customer writes again: still one conversation.
    await handleInboundMessage(state.db.client as never, conv);
    expect(await getChekelinUsage(state.db.client as never, BIZ)).toMatchObject({ used: 1, allowance: LIMIT });
  });

  it("records what each model call used, for the cost report", async () => {
    const conv = newConversation();
    await handleInboundMessage(state.db.client as never, conv);
    expect(state.db.rows("chekelin_usage")).toEqual([
      expect.objectContaining({
        business_id: BIZ,
        store_id: STORE,
        conversation_id: conv,
        kind: "seller",
        model: "claude-sonnet-5-5",
        input_tokens: 600,
        output_tokens: 350,
        cache_read_tokens: 4000,
        cache_write_tokens: 0,
      }),
    ]);
  });

  it("doesn't count Chat's modo prueba", async () => {
    const conv = newConversation();
    await handleInboundMessage(state.db.client as never, conv, { sendExternally: false });
    expect(botMessages(conv)).toHaveLength(1);
    expect((await getChekelinUsage(state.db.client as never, BIZ))?.used).toBe(0);
  });
});

describe("chekelin at the Plan's monthly limit", () => {
  it("hands new chats to the team without calling the model, and tells the Dueño once", async () => {
    await alreadyAttended(LIMIT);
    state.modelCalls = 0;

    const first = newConversation();
    await handleInboundMessage(state.db.client as never, first);
    const second = newConversation();
    await handleInboundMessage(state.db.client as never, second);

    expect(state.modelCalls).toBe(0);
    expect(botMessages(first)).toEqual([]);
    expect(botMessages(second)).toEqual([]);
    // The team is alerted about each chat, like any message chekelin doesn't take.
    expect(state.alerts.map((a) => a.conversationId)).toEqual(expect.arrayContaining([first, second]));
    // One notice for the month, to the Dueños.
    expect(state.pushes).toEqual([
      {
        people: [OWNER],
        title: "chekelin llegó al límite de tu plan este mes",
        body: "Los chats nuevos los atiende tu equipo hasta el 1 de noviembre. En Mi cuenta ves cómo seguir.",
        url: "/account",
      },
    ]);
    expect(await getChekelinUsage(state.db.client as never, BIZ)).toMatchObject({ used: LIMIT, allowance: LIMIT });
  });

  it("keeps attending a conversation it already started this month", async () => {
    await alreadyAttended(LIMIT);
    const started = state.db.rows("conversations")[0].id as string;
    state.modelCalls = 0;
    await handleInboundMessage(state.db.client as never, started);
    expect(state.modelCalls).toBe(1);
    expect(botMessages(started)).toHaveLength(2);
  });

  it("an extra pack for this month lets chekelin take more", async () => {
    await alreadyAttended(LIMIT);
    Object.assign(state.db.rows("businesses")[0], { chekelin_extra: 100, chekelin_extra_month: "2026-10-01" });
    const conv = newConversation();
    await handleInboundMessage(state.db.client as never, conv);
    expect(botMessages(conv)).toHaveLength(1);
    expect(state.pushes).toEqual([]);
    expect(await getChekelinUsage(state.db.client as never, BIZ)).toMatchObject({ used: LIMIT + 1, allowance: LIMIT + 100 });
  });

  it("a plan without a limit (pilots) is never stopped", async () => {
    Object.assign(state.db.rows("businesses")[0], { plan: "trial" });
    await alreadyAttended(LIMIT + 1);
    expect(state.modelCalls).toBe(LIMIT + 1);
    expect(state.pushes).toEqual([]);
  });
});

describe("a new month", () => {
  it("chekelin resumes on the 1st, Honduras time, and can notify again that month", async () => {
    await alreadyAttended(LIMIT);
    await handleInboundMessage(state.db.client as never, newConversation());
    expect(state.pushes).toHaveLength(1);

    vi.setSystemTime(NOVEMBER);
    state.modelCalls = 0;
    const conv = newConversation();
    await handleInboundMessage(state.db.client as never, conv);
    expect(state.modelCalls).toBe(1);
    expect(botMessages(conv)).toHaveLength(1);
    expect(await getChekelinUsage(state.db.client as never, BIZ)).toMatchObject({ used: 1, month: "2026-11-01" });
  });
});
