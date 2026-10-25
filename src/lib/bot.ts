import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideSeller,
  decideSimpleFact,
  productRefs,
  type HandoffReason,
  type OrderDraft,
  type ProductRef,
  type SellerDecision,
} from "@/lib/ai";
import {
  sendOnChannel,
  showTyping,
  SEND_CHANNEL_COLUMNS,
  SEND_CONTACT_COLUMNS,
  type SendChannel,
  type SendContact,
} from "@/lib/channelSend";
import { replyWindow } from "@/lib/messagingWindow";
import { markMessageFailed } from "@/lib/whatsappErrors";
import { notifyConversation, sendPushToPeople } from "@/lib/push";
import { canUseChekelin } from "@/lib/plan";
import { countChekelinConversation, mayChekelinAttend, noticeChekelinLimit, recordChekelinUsage } from "@/lib/chekelinAllowance";
import {
  chekelinChatState,
  firstNameOf,
  handoffLine,
  humanDelayMs,
  paymentConfirmedLine,
  secondMessageDelayMs,
  simpleFactEnding,
  stageAfterChekelin,
  waitNoticeLine,
} from "@/lib/chekelinState";
import { buildPaymentMessage, orderConcept, type OrderItem } from "@/lib/payments";
import { formatLempiras, productMessageText } from "@/lib/format";
import { recordPaymentRequest } from "@/lib/orders";
import { textForChekelin } from "@/lib/transcription";
import { waitForVoiceTranscription } from "@/lib/voiceTranscription";
import { EMPTY_CHEKELIN_INFO, type ChannelType, type ChekelinInfo, type Message, type Template } from "@/lib/types";
import { hasStoreLocation, locationSendPlan, type StoreLocation } from "@/lib/storeLocation";
import { getStoreLocation } from "@/lib/storeLocationServer";
import { FALTA_INFO_LABEL } from "@/lib/conversationNotes";

// chekelin sells on its own (answers, photos, order, payment details,
// receipt), hands the chat to a person when it should (Traspaso), handles
// Quejas, and runs the 5 / 10 minute timers. Design: issues #28 and #40
// (closing comments), built in #30 and #42.
//
// Server-only, and always with the service-role client (the webhooks, the
// timers cron job, or a server action after it checked the person's access):
// routing reads the whole team and writes on their behalf.
//
// The conversation's bookkeeping (customer wrote, a person replied, chekelin
// coming back after a close or 7 days) is kept by a database trigger
// (migration 0021); this file decides and speaks.

type Admin = SupabaseClient;

// "About 15 chekelin messages without reaching an order": then a person takes it.
const SALE_CAP = 15;

const CONVERSATION_COLUMNS = `id, business_id, store_id, contact_id, stage, bot_enabled, handed_off_at, chekelin_replies, chekelin_order_at, complaint_open_at, assigned_to, window_expires_at, last_inbound_at, awaiting_since, contact:contacts(name, ${SEND_CONTACT_COLUMNS}), channel:channels(${SEND_CHANNEL_COLUMNS}), store:stores(name, chekelin_off_until), business:businesses(name, plan, is_demo)`;

export type LoadedConversation = {
  id: string;
  businessId: string;
  storeId: string;
  contactId: string;
  stage: string | null;
  botEnabled: boolean;
  handedOffAt: string | null;
  chekelinReplies: number;
  chekelinOrderAt: string | null;
  complaintOpenAt: string | null;
  assignedTo: string | null;
  windowExpiresAt: string | null;
  lastInboundAt: string | null;
  awaitingSince: string | null;
  contactName: string;
  contact: SendContact | null;
  channel: SendChannel | null;
  storeOffUntil: string | null;
  storeName: string;
  businessName: string;
  plan: string;
  isDemo: boolean;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

async function loadConversation(supabase: Admin, conversationId: string): Promise<LoadedConversation | null> {
  const { data } = await supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("id", conversationId).maybeSingle();
  if (!data) return null;
  const contact = one(data.contact as unknown) as (SendContact & { name: string }) | null;
  const store = one(data.store as unknown) as { name?: string; chekelin_off_until: string | null } | null;
  const business = one(data.business as unknown) as { name: string; plan: string; is_demo?: boolean } | null;
  return {
    id: data.id,
    businessId: data.business_id,
    storeId: data.store_id,
    contactId: data.contact_id,
    stage: data.stage ?? null,
    botEnabled: data.bot_enabled,
    handedOffAt: data.handed_off_at,
    chekelinReplies: data.chekelin_replies ?? 0,
    chekelinOrderAt: data.chekelin_order_at ?? null,
    complaintOpenAt: data.complaint_open_at ?? null,
    assignedTo: data.assigned_to,
    windowExpiresAt: data.window_expires_at,
    lastInboundAt: data.last_inbound_at,
    awaitingSince: data.awaiting_since,
    contactName: contact?.name ?? "Un cliente",
    contact,
    channel: one(data.channel as unknown) as SendChannel | null,
    storeOffUntil: store?.chekelin_off_until ?? null,
    storeName: store?.name ?? "",
    businessName: business?.name ?? "el negocio",
    plan: business?.plan ?? "",
    isDemo: business?.is_demo === true,
  };
}

function stateOf(conv: LoadedConversation) {
  return chekelinChatState({
    available: canUseChekelin(conv.plan),
    storeOffUntil: conv.storeOffUntil,
    botEnabled: conv.botEnabled,
    handedOffAt: conv.handedOffAt,
    complaintOpenAt: conv.complaintOpenAt,
    nowMs: Date.now(),
  });
}

// An automation (chekelin, the 5-minute notice) may only write while the
// customer's reply window is open (no chekelin outside 24 h).
function automationMayWrite(conv: LoadedConversation, sendExternally: boolean): boolean {
  return !sendExternally || replyWindow(conv.channel?.type, conv.windowExpiresAt, Date.now()) === "open";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The first name a customer sees ("Te paso con María"), from the person's
// sign-in profile. Null when they never set a name.
export async function firstNameForUser(supabase: Admin, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const meta = data.user?.user_metadata ?? {};
    return firstNameOf((meta.full_name ?? meta.name) as string | undefined);
  } catch {
    return null;
  }
}

// Saves one automated message (chekelin or the plain automatic notice) and
// sends it on the conversation's channel.
async function sendAutomated(
  supabase: Admin,
  conv: LoadedConversation,
  text: string,
  sendExternally: boolean,
  mediaUrl?: string | null,
  // The Tienda's map pin (WhatsApp); `text` is its address and Maps link.
  location?: Extract<OutboxItem, { kind: "location" }>["location"],
): Promise<Message | null> {
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conv.id,
      business_id: conv.businessId,
      direction: "out",
      body: text,
      media_url: mediaUrl ?? null,
      is_bot: true,
      status: "sent",
      // Shown in Chat as the same map card as "Ubicación" (sendStoreLocation).
      ...(location
        ? {
            media_kind: "location",
            media_info: {
              latitude: location.latitude,
              longitude: location.longitude,
              ...(location.name ? { place: location.name } : {}),
              ...(location.address ? { address: location.address } : {}),
            },
          }
        : {}),
    })
    .select("*")
    .single();
  if (error || !message) {
    console.error("chekelin message save error", error);
    return null;
  }
  await supabase.from("conversations").update({ last_message_at: message.created_at }).eq("id", conv.id);

  if (sendExternally && !conv.isDemo) {
    const result = await sendOnChannel({
      channel: conv.channel,
      contact: conv.contact,
      windowExpiresAt: conv.windowExpiresAt,
      text,
      mediaUrl,
      location,
      author: "bot",
    });
    if (result.error) {
      await markMessageFailed(supabase, message.id, result);
    } else if (!result.notSent && result.externalMessageId) {
      await supabase.from("messages").update({ external_message_id: result.externalMessageId }).eq("id", message.id);
    }
  }
  return message as Message;
}

// Assigns the conversation if nobody has it (same person as last time →
// least busy available Agente → Gerente → Dueño). Returns who has it.
export async function routeConversation(supabase: Admin, conversationId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("route_conversation", { p_conversation_id: conversationId });
  if (error) {
    console.error("route_conversation error", error);
    return null;
  }
  return (data as string | null) ?? null;
}

async function recentHistory(supabase: Admin, conversationId: string) {
  const { data } = await supabase
    .from("messages")
    .select("direction, body, transcription, external_message_id, created_at")
    .eq("conversation_id", conversationId)
    // newest 30, reversed below
    .order("created_at", { ascending: false })
    .limit(30);
  // A transcribed voice note reads as what the customer said (issue #49).
  return (data ?? []).reverse().map((m) => ({
    direction: m.direction as Message["direction"],
    body: textForChekelin(m),
    external_message_id: m.external_message_id as string | null,
    created_at: m.created_at as string,
  }));
}

type PendingOrder = { id: string; concept: string; totalHnl: number; receiptSent: boolean };

export type Knowledge = {
  info: ChekelinInfo;
  refs: ProductRef[];
  templates: Template[];
  pendingOrder: PendingOrder | null;
  // The Tienda's location ("Lo que chekelin sabe", migration 0034).
  location: StoreLocation | null;
};

// What chekelin knows: "Lo que chekelin sabe" of the Tienda, its Catálogo,
// the Negocio's Plantillas, and an order of this chat waiting for payment.
async function loadKnowledge(supabase: Admin, conv: LoadedConversation): Promise<Knowledge> {
  const [{ data: products }, { data: templates }, { data: info }, { data: orders }, location] = await Promise.all([
    supabase.from("products").select("*").eq("store_id", conv.storeId).eq("visible", true).order("created_at"),
    supabase.from("templates").select("*").eq("business_id", conv.businessId),
    supabase
      .from("store_chekelin_info")
      .select("payment_methods, shipping, delivery_hours, returns_policy, faq, address_form")
      .eq("store_id", conv.storeId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, items, total_hnl, receipt_at")
      .eq("conversation_id", conv.id)
      .eq("status", "awaiting_payment")
      .order("created_at", { ascending: false })
      .limit(1),
    // Its own query: before migration 0034 the columns don't exist (null).
    getStoreLocation(supabase, conv.storeId),
  ]);
  const order = orders?.[0];
  return {
    info: { ...EMPTY_CHEKELIN_INFO, ...(info ?? {}) } as ChekelinInfo,
    refs: productRefs(products ?? []),
    templates: (templates ?? []) as Template[],
    pendingOrder: order
      ? {
          id: order.id,
          concept: orderConcept((order.items ?? []) as OrderItem[]),
          totalHnl: Number(order.total_hnl),
          receiptSent: Boolean(order.receipt_at),
        }
      : null,
    location: location && hasStoreLocation(location) ? location : null,
  };
}

// The Tienda's Gerentes; the Dueños when it has none.
export async function managersOf(supabase: Admin, businessId: string, storeId: string): Promise<string[]> {
  const [{ data: members }, { data: storeRows }] = await Promise.all([
    supabase.from("members").select("user_id, role, created_at").eq("business_id", businessId).order("created_at"),
    supabase.from("store_members").select("user_id").eq("store_id", storeId),
  ]);
  const inStore = new Set((storeRows ?? []).map((r) => r.user_id as string));
  const managers = (members ?? []).filter((m) => m.role === "manager" && inStore.has(m.user_id)).map((m) => m.user_id as string);
  if (managers.length > 0) return managers;
  return (members ?? []).filter((m) => m.role === "owner").map((m) => m.user_id as string);
}

// Dueños who turned on "avisarme de todo".
export async function notifyAllOwners(supabase: Admin, businessId: string): Promise<string[]> {
  const { data } = await supabase.from("members").select("user_id").eq("business_id", businessId).eq("role", "owner").eq("notify_all", true);
  return (data ?? []).map((m) => m.user_id as string);
}

export const HANDOFF_REASON_LABEL: Record<
  HandoffReason | "tope" | "chekelin_apagado" | "total" | "sin_formas_pago" | "comprobante_sin_cobro",
  string
> = {
  pide_persona: "Pidió hablar con una persona",
  falta_info: FALTA_INFO_LABEL,
  descuento: "Pide descuento o pedido especial",
  ninguna: "chekelin pasó el chat a una persona",
  tope: "15 mensajes de chekelin sin pedido",
  chekelin_apagado: "chekelin se apagó en la tienda",
  total: "El total no cuadró: revísalo antes de cobrar",
  sin_formas_pago: 'Faltan las "Formas de pago" de chekelin',
  comprobante_sin_cobro: "Dice que pagó, pero no hay cobro pendiente",
};

// The Traspaso: assign a person, tell the customer who will help them, leave
// the team-only summary note, start the 5-minute timer and alert the person.
async function handOff(
  supabase: Admin,
  conv: LoadedConversation,
  input: { summary: string; reason: string; lineKind?: "default" | "confirm"; sendExternally: boolean; pace?: boolean },
): Promise<Message | null> {
  const assignee = await routeConversation(supabase, conv.id);
  const name = await firstNameForUser(supabase, assignee);
  const now = new Date().toISOString();

  await supabase
    .from("conversations")
    .update({
      handed_off_at: now,
      awaiting_since: now,
      wait_notice_sent_at: null,
      escalated_at: null,
      // The message that caused the handoff is not a "simple fact" to answer later.
      simple_fact_checked_at: conv.lastInboundAt,
    })
    .eq("id", conv.id);

  await supabase.from("conversation_notes").insert({
    business_id: conv.businessId,
    store_id: conv.storeId,
    conversation_id: conv.id,
    kind: "handoff",
    summary: input.summary || "El cliente necesita que lo atienda una persona.",
    reason: input.reason,
  });

  let message: Message | null = null;
  if (automationMayWrite(conv, input.sendExternally)) {
    const text = handoffLine(name, input.lineKind);
    if (input.pace) await sleep(secondMessageDelayMs(text));
    message = await sendAutomated(supabase, conv, text, input.sendExternally);
  }

  await notifyConversation(
    supabase,
    { businessId: conv.businessId, storeId: conv.storeId, assignedTo: assignee },
    { title: `${conv.contactName} te espera`, body: `chekelin te pasó el chat: ${input.summary || input.reason}`, conversationId: conv.id },
  );
  return message;
}

// A customer message was just saved. chekelin answers and sells, or hands
// the chat off; when chekelin isn't handling it here (handed off, open Queja,
// paused, off in the Tienda, not in the plan), the conversation goes to a
// person and they are notified.
//
// sendExternally = false for Chat's "modo prueba": nothing goes to the real
// customer.
export async function handleInboundMessage(
  supabase: Admin,
  conversationId: string,
  { sendExternally = true, preview }: { sendExternally?: boolean; preview?: string | null } = {},
): Promise<{ message?: Message; error?: string }> {
  const conv = await loadConversation(supabase, conversationId);
  if (!conv) return { error: "No se encontró la conversación." };
  const state = stateOf(conv);

  // The Plan's monthly allowance (issue #9): at the limit, new conversations
  // go quietly to the team and the Dueños get one notice. Modo prueba is
  // never limited and never counts.
  let overLimit = false;
  if (state === "active" && sendExternally && !(await mayChekelinAttend(supabase, conv))) {
    overLimit = true;
    await noticeChekelinLimit(supabase, conv);
  }

  if (state === "active" && !overLimit && automationMayWrite(conv, sendExternally)) {
    const result = await runSeller(supabase, conv, sendExternally, preview);
    if (!result.error) return result;
    // chekelin couldn't answer (no API key, an outage…): a person takes it,
    // without saying anything to the customer.
    console.error("chekelin seller error", result.error);
    const assignee = await routeConversation(supabase, conv.id);
    await notifyConversation(
      supabase,
      { businessId: conv.businessId, storeId: conv.storeId, assignedTo: assignee },
      { title: conv.contactName, body: preview ?? "Nuevo mensaje", conversationId: conv.id },
    );
    return { error: result.error };
  }

  const assignee = await routeConversation(supabase, conv.id);
  await notifyConversation(
    supabase,
    { businessId: conv.businessId, storeId: conv.storeId, assignedTo: assignee },
    {
      title: state === "complaint" ? `🔴 ${conv.contactName} (queja abierta)` : conv.contactName,
      body: preview ?? "Nuevo mensaje",
      conversationId: conv.id,
    },
  );
  return {};
}

// What chekelin does with its decision, after the safety checks.
type Plan =
  | { kind: "reply" }
  | { kind: "handoff"; reason: string; lineKind: "default" | "confirm"; dropMessages: boolean }
  // chekelin didn't know something: it told the customer it will confirm,
  // the team is asked, and chekelin keeps selling the rest.
  | { kind: "ask_team"; reason: string }
  | { kind: "complaint" }
  | { kind: "order"; order: OrderDraft }
  | { kind: "receipt"; orderId: string };

export function planFor(decision: SellerDecision, conv: LoadedConversation, know: Knowledge): Plan {
  switch (decision.action) {
    case "complaint":
      return { kind: "complaint" };
    case "handoff": {
      const reason = decision.handoffReason === "ninguna" ? "pide_persona" : decision.handoffReason;
      if (reason === "falta_info" && decision.messages.length > 0) {
        return { kind: "ask_team", reason: HANDOFF_REASON_LABEL.falta_info };
      }
      return {
        kind: "handoff",
        reason: HANDOFF_REASON_LABEL[reason],
        lineKind: reason === "falta_info" ? "confirm" : "default",
        dropMessages: false,
      };
    }
    case "order_ready": {
      if (!know.info.payment_methods.trim()) {
        return { kind: "handoff", reason: HANDOFF_REASON_LABEL.sin_formas_pago, lineKind: "default", dropMessages: true };
      }
      // Never charge a total that doesn't add up: a person checks it.
      const order = decision.order;
      const sum = order.items.reduce((acc, i) => acc + i.quantity * i.unit_price_hnl, 0) + order.shipping_hnl;
      if (order.items.length === 0 || order.total_hnl <= 0 || Math.abs(sum - order.total_hnl) > 1) {
        return { kind: "handoff", reason: HANDOFF_REASON_LABEL.total, lineKind: "default", dropMessages: true };
      }
      return { kind: "order", order };
    }
    case "payment_receipt":
      if (!know.pendingOrder) {
        return { kind: "handoff", reason: HANDOFF_REASON_LABEL.comprobante_sin_cobro, lineKind: "default", dropMessages: false };
      }
      return { kind: "receipt", orderId: know.pendingOrder.id };
    default:
      // Safety cap: about 15 messages without reaching an order.
      if (conv.chekelinReplies >= SALE_CAP && !conv.chekelinOrderAt) {
        return { kind: "handoff", reason: HANDOFF_REASON_LABEL.tope, lineKind: "default", dropMessages: true };
      }
      if (decision.messages.length === 0) {
        return { kind: "handoff", reason: HANDOFF_REASON_LABEL.ninguna, lineKind: "default", dropMessages: true };
      }
      return { kind: "reply" };
  }
}

// What chekelin sends for one decision, in order: its first message, the
// product photos, the Tienda's location, then its second message. The
// handoff line and the payment details come after, from the plan.
export type OutboxItem =
  | { kind: "text"; text: string }
  | { kind: "product"; text: string; mediaUrl: string | null }
  | { kind: "location"; text: string; location: NonNullable<ReturnType<typeof locationSendPlan>>["location"] };

export function chekelinOutbox(
  decision: SellerDecision,
  plan: Plan,
  know: Knowledge,
  ctx: { channelType: ChannelType | null | undefined; storeName: string },
): OutboxItem[] {
  const texts = plan.kind === "handoff" && plan.dropMessages ? [] : decision.messages;
  // Photos and the map only while chekelin keeps selling.
  const selling = plan.kind === "reply" || plan.kind === "ask_team";
  const out: OutboxItem[] = [];
  if (texts[0]) out.push({ kind: "text", text: texts[0] });
  if (selling) {
    for (const ref of decision.productRefs) {
      const product = know.refs.find((x) => x.ref === ref)?.product;
      if (product) out.push({ kind: "product", text: productMessageText(product), mediaUrl: product.image_url ?? null });
    }
    const where = decision.sendLocation && know.location ? locationSendPlan(ctx.channelType, know.location, ctx.storeName) : null;
    if (where) out.push({ kind: "location", text: where.text, location: where.location });
  }
  if (texts[1]) out.push({ kind: "text", text: texts[1] });
  return out;
}

async function runSeller(
  supabase: Admin,
  conv: LoadedConversation,
  sendExternally: boolean,
  preview: string | null | undefined,
): Promise<{ message?: Message; error?: string }> {
  const started = Date.now();
  // A voice note that just arrived is still being transcribed: wait for its
  // words (counts toward the natural pause below).
  await waitForVoiceTranscription(supabase, conv.id);
  const [history, know, managers] = await Promise.all([
    recentHistory(supabase, conv.id),
    loadKnowledge(supabase, conv),
    managersOf(supabase, conv.businessId, conv.storeId),
  ]);
  const managerName = await firstNameForUser(supabase, managers[0] ?? null);

  const { decision, error, usage } = await decideSeller({
    businessName: conv.businessName,
    info: know.info,
    refs: know.refs,
    templates: know.templates,
    managerName,
    pendingOrder: know.pendingOrder,
    location: know.location,
    history,
  });
  await recordChekelinUsage(
    supabase,
    { businessId: conv.businessId, storeId: conv.storeId, conversationId: conv.id, kind: "seller", test: !sendExternally },
    usage,
  );
  if (!decision) return { error };

  const plan = planFor(decision, conv, know);
  const outbox = chekelinOutbox(decision, plan, know, { channelType: conv.channel?.type, storeName: conv.storeName || conv.businessName });
  const texts = outbox.filter((o) => o.kind === "text").map((o) => o.text);

  // Like a person: "escribiendo…", then a pause that grows with the reply.
  const live = sendExternally && !conv.isDemo;
  const lastInbound = [...history].reverse().find((m) => m.direction === "in");
  const typing = () =>
    live
      ? showTyping({
          channel: conv.channel,
          contact: conv.contact,
          windowExpiresAt: conv.windowExpiresAt,
          inboundMessageId: lastInbound?.external_message_id,
        })
      : Promise.resolve();
  await typing();
  await sleep(humanDelayMs(texts[0] ?? handoffLine(null), Date.now() - started));

  // The customer wrote again meanwhile, or a person took over: drop this
  // reply (the newer message gets its own, with the whole conversation).
  const now = await loadConversation(supabase, conv.id);
  if (!now || stateOf(now) !== "active" || now.lastInboundAt !== conv.lastInboundAt || !automationMayWrite(now, sendExternally)) {
    return {};
  }

  const sent: Message[] = [];
  const say = async (text: string, mediaUrl?: string | null, location?: Extract<OutboxItem, { kind: "location" }>["location"]) => {
    const message = await sendAutomated(supabase, now, text, sendExternally, mediaUrl, location);
    if (message) sent.push(message);
  };

  // chekelin's words, the product photos (same text as "Enviar producto"),
  // the Tienda's location, then its second message after a short pause.
  for (const [i, item] of outbox.entries()) {
    if (item.kind === "text" && i > 0) {
      await typing();
      await sleep(secondMessageDelayMs(item.text));
    }
    if (item.kind === "text") await say(item.text);
    else if (item.kind === "product") await say(item.text, item.mediaUrl);
    else await say(item.text, null, item.location);
  }

  // chekelin wrote to a real customer: this conversation counts for the
  // month (a handoff without words of its own doesn't).
  if (sendExternally && sent.length > 0) await countChekelinConversation(supabase, now);

  switch (plan.kind) {
    case "handoff": {
      const message = await handOff(supabase, now, {
        summary: decision.teamSummary,
        reason: plan.reason,
        lineKind: plan.lineKind,
        sendExternally,
        pace: sent.length > 0,
      });
      const shown = sent[0] ?? message;
      return shown ? { message: shown } : {};
    }
    case "complaint":
      await openComplaint(supabase, now, decision.teamSummary, managers);
      return sent[0] ? { message: sent[0] } : {};
    case "order": {
      await sleep(1_500);
      await sendPaymentDetails(supabase, now, plan.order, know.info, sendExternally, say);
      break;
    }
    case "receipt":
      await receiptReceived(supabase, now, plan.orderId, decision.teamSummary);
      break;
    case "ask_team":
      await askTeam(supabase, now, decision.teamSummary, managers);
      break;
  }

  if (plan.kind === "reply" || plan.kind === "ask_team") {
    const stage = stageAfterChekelin(now.stage, { messages: texts, productsSent: outbox.filter((o) => o.kind === "product").length });
    if (stage) await supabase.from("conversations").update({ stage }).eq("id", now.id);
  }

  await chekelinSpoke(supabase, now, sent.filter((m) => !m.media_url && !m.media_kind).length);
  // Nobody is interrupted while chekelin handles it, except Dueños with
  // "avisarme de todo".
  await notifyConversation(
    supabase,
    { businessId: now.businessId, storeId: now.storeId, assignedTo: null, chekelinHandling: true },
    { title: now.contactName, body: preview ?? "Nuevo mensaje", conversationId: now.id },
  );
  return sent[0] ? { message: sent[0] } : {};
}

// chekelin didn't have an answer (envío a una ciudad, un horario…): the
// Gerente (or Dueño) gets the question to answer in the chat, and a nudge to
// add it to "Lo que chekelin sabe". chekelin keeps attending meanwhile; when
// the person writes in the chat, chekelin steps back as usual.
async function askTeam(supabase: Admin, conv: LoadedConversation, summary: string, managers: string[]): Promise<void> {
  const question = summary || "El cliente preguntó algo que chekelin no sabe.";
  await supabase.from("conversation_notes").insert({
    business_id: conv.businessId,
    store_id: conv.storeId,
    conversation_id: conv.id,
    kind: "handoff",
    summary: question,
    reason: `${HANDOFF_REASON_LABEL.falta_info} · sigue atendiendo`,
  });
  const people = managers.length > 0 ? managers : await notifyAllOwners(supabase, conv.businessId);
  await sendPushToPeople(supabase, conv.businessId, conv.storeId, people, {
    title: `${conv.contactName} pregunta algo que chekelin no sabe`,
    body: `${question} Respóndele en el chat y agrégalo en chekelin para la próxima.`,
    conversationId: conv.id,
  });
}

// chekelin answered: count its messages, and the customer isn't waiting on a
// person (unless they wrote again meanwhile).
async function chekelinSpoke(supabase: Admin, conv: LoadedConversation, count: number): Promise<void> {
  const replies = conv.chekelinReplies + Math.max(1, count);
  let clear = supabase
    .from("conversations")
    .update({ chekelin_replies: replies, awaiting_since: null, simple_fact_checked_at: conv.lastInboundAt })
    .eq("id", conv.id);
  clear = conv.lastInboundAt ? clear.eq("last_inbound_at", conv.lastInboundAt) : clear;
  const { data: cleared } = await clear.select("id");
  if (!cleared?.length) {
    await supabase.from("conversations").update({ chekelin_replies: replies }).eq("id", conv.id);
  }
}

// The order is confirmed: send the payment details the "Cobrar" way (the
// Tienda's Formas de pago) and record the order awaiting payment.
async function sendPaymentDetails(
  supabase: Admin,
  conv: LoadedConversation,
  order: OrderDraft,
  info: ChekelinInfo,
  sendExternally: boolean,
  say: (text: string) => Promise<void>,
): Promise<void> {
  const items: OrderItem[] = order.items.map((i) => ({
    name: i.product,
    details: i.details || undefined,
    quantity: i.quantity,
    price_hnl: i.unit_price_hnl,
  }));
  const concept = orderConcept(items, order.shipping_hnl);
  await say(buildPaymentMessage({ concept, amountHnl: order.total_hnl, instructions: info.payment_methods }));
  await recordPaymentRequest(supabase, {
    conversationId: conv.id,
    businessId: conv.businessId,
    contactId: conv.contactId,
    stage: conv.stage,
    items,
    totalHnl: order.total_hnl,
    source: "chekelin",
    details: {
      customer_name: order.customer_name,
      city: order.city,
      address: order.address,
      delivery_method: order.delivery_method,
      shipping_hnl: order.shipping_hnl,
      // Taken in Chat's modo prueba: confirming it never writes to the customer.
      ...(sendExternally ? {} : { test: true }),
    },
  });
  await supabase.from("conversations").update({ chekelin_order_at: new Date().toISOString() }).eq("id", conv.id);
}

// The customer sent a receipt (or says they paid). chekelin already thanked
// them; the responsible people get a one-tap "Confirmar pago". This is not a
// Traspaso: chekelin keeps the chat.
async function receiptReceived(supabase: Admin, conv: LoadedConversation, orderId: string, summary: string): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .update({ receipt_at: new Date().toISOString() })
    .eq("id", orderId)
    .select("total_hnl")
    .maybeSingle();
  const total = order ? formatLempiras(Number(order.total_hnl)) : "";

  await supabase.from("conversation_notes").insert({
    business_id: conv.businessId,
    store_id: conv.storeId,
    conversation_id: conv.id,
    kind: "payment",
    summary: summary || "El cliente dice que ya pagó.",
    reason: `Comprobante${total ? ` de ${total}` : ""}: revisa y confirma el pago`,
  });

  const people = new Set([...(conv.assignedTo ? [conv.assignedTo] : []), ...(await managersOf(supabase, conv.businessId, conv.storeId))]);
  for (const owner of await notifyAllOwners(supabase, conv.businessId)) people.add(owner);
  await sendPushToPeople(supabase, conv.businessId, conv.storeId, [...people], {
    title: `💳 ${conv.contactName} mandó su comprobante${total ? ` (${total})` : ""}`,
    body: "Revisa que el dinero entró y toca para confirmar el pago.",
    conversationId: conv.id,
    linkExtra: `confirmar=${orderId}`,
  });
}

// A Queja: chekelin already answered with empathy and named the Gerente. The
// chat gets the red Queja tag, chekelin goes silent until a person marks it
// resolved, and the Tienda's Gerente (else the Dueño) gets an urgent alert.
async function openComplaint(
  supabase: Admin,
  conv: LoadedConversation,
  summary: string,
  managers: string[],
  { alert = true }: { alert?: boolean } = {},
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("conversations")
    .update({
      complaint_open_at: now,
      complaint_resolved_at: null,
      handed_off_at: conv.handedOffAt ?? now,
      awaiting_since: now,
      wait_notice_sent_at: null,
      escalated_at: null,
      simple_fact_checked_at: conv.lastInboundAt,
      // The Gerente (or Dueño) owns a Queja, unless someone already has the chat.
      ...(conv.assignedTo || !managers[0] ? {} : { assigned_to: managers[0], assigned_at: now, last_assigned_to: managers[0] }),
    })
    .eq("id", conv.id);

  await supabase.from("conversation_notes").insert({
    business_id: conv.businessId,
    store_id: conv.storeId,
    conversation_id: conv.id,
    kind: "complaint",
    summary: summary || "El cliente tiene una queja.",
    reason: "chekelin en pausa hasta resolverla",
  });

  if (!alert) return;
  const people = new Set(managers);
  for (const owner of await notifyAllOwners(supabase, conv.businessId)) people.add(owner);
  await sendPushToPeople(supabase, conv.businessId, conv.storeId, [...people], {
    title: `🔴 Queja de ${conv.contactName}`,
    body: summary || "Un cliente tiene una queja. Atiéndelo lo antes posible.",
    conversationId: conv.id,
  });
}

// A negative comment under a post moved to a private chat (Comentarios,
// issue #43): the chekelin private reply already did the empathetic part, so
// the chat gets the Queja straight away. `alert` = false when the Gerente was
// already alerted about the comment itself.
export async function openComplaintFromComment(
  supabase: Admin,
  conversationId: string,
  summary: string,
  { alert }: { alert: boolean },
): Promise<void> {
  const conv = await loadConversation(supabase, conversationId);
  if (!conv || conv.complaintOpenAt) return;
  const managers = await managersOf(supabase, conv.businessId, conv.storeId);
  await openComplaint(supabase, conv, summary, managers, { alert });
}

// "Confirmar pago" was tapped (the order is already marked paid by the
// caller, who checked access). The deal is won; on an order chekelin took,
// chekelin tells the customer. Returns whether the customer was told.
export async function afterPaymentConfirmed(
  supabase: Admin,
  orderId: string,
): Promise<{ told: boolean }> {
  const { data: order } = await supabase.from("orders").select("conversation_id, source, details").eq("id", orderId).maybeSingle();
  if (!order?.conversation_id) return { told: false };
  await supabase
    .from("conversations")
    // A new sale starts the 15-message count again.
    .update({ stage: "ganado", chekelin_replies: 0, chekelin_order_at: null })
    .eq("id", order.conversation_id);

  if (order.source !== "chekelin") return { told: false };
  const conv = await loadConversation(supabase, order.conversation_id);
  if (!conv) return { told: false };
  const state = stateOf(conv);
  if (state === "off" || state === "complaint" || state === "paused") return { told: false };
  const sendExternally = !(order.details as { test?: boolean } | null)?.test;
  if (!automationMayWrite(conv, sendExternally)) return { told: false };
  const message = await sendAutomated(supabase, conv, paymentConfirmedLine(), sendExternally);
  return { told: Boolean(message) };
}

// chekelin was switched off in a Tienda: the chats it was handling go to a
// person right away.
export async function handOffActiveChats(supabase: Admin, storeId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("store_id", storeId)
    .is("handed_off_at", null)
    .eq("bot_enabled", true)
    .gt("chekelin_replies", 0)
    .gt("last_inbound_at", since)
    .limit(50);

  for (const row of data ?? []) {
    try {
      const conv = await loadConversation(supabase, row.id);
      if (!conv || conv.handedOffAt) continue;
      const { data: last } = await supabase
        .from("messages")
        .select("body")
        .eq("conversation_id", conv.id)
        .eq("direction", "in")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await handOff(supabase, conv, {
        summary: last?.body ? `Último mensaje del cliente: "${last.body}"` : "",
        reason: HANDOFF_REASON_LABEL.chekelin_apagado,
        sendExternally: true,
      });
    } catch (error) {
      console.error("handoff on switch-off error", row.id, error);
    }
  }
}

// ---------------------------------------------------------------------------
// Timers (run every minute by /api/cron/chekelin)
// ---------------------------------------------------------------------------

// Customer messages older than this never get an automatic answer (e.g. the
// cron job was down): a late "ya le avisamos" would only confuse.
const STALE_MS = 30 * 60 * 1000;

function fresh(iso: string | null, nowMs: number, maxAgeMs = STALE_MS): boolean {
  return Boolean(iso) && nowMs - new Date(iso as string).getTime() < maxAgeMs;
}

type Due = { id: string; facts_due: boolean; notice_due: boolean; escalation_due: boolean };

export async function runTimers(supabase: Admin): Promise<{ checked: number; error?: string }> {
  const { data, error } = await supabase.rpc("chekelin_due_conversations", { p_limit: 50 });
  if (error) return { checked: 0, error: error.message };
  const due = (data ?? []) as Due[];
  for (const item of due) {
    try {
      await runDue(supabase, item);
    } catch (e) {
      console.error("chekelin timer error", item.id, e);
    }
  }
  return { checked: due.length };
}

// Each step first "claims" its timestamp with a conditional update, so two
// overlapping runs never send the same thing twice.
async function runDue(supabase: Admin, item: Due): Promise<void> {
  const conv = await loadConversation(supabase, item.id);
  if (!conv || !conv.awaitingSince) return;
  const nowMs = Date.now();
  let factSent = false;

  // Simple facts: handed off, the person hasn't replied 5 minutes after the
  // customer's last message. Only price, colors, sizes, shipping, payment
  // methods. Never while a Queja is open (stateOf → "complaint").
  if (item.facts_due && conv.lastInboundAt) {
    const { data: claimed } = await supabase
      .from("conversations")
      .update({ simple_fact_checked_at: conv.lastInboundAt })
      .eq("id", conv.id)
      .or(`simple_fact_checked_at.is.null,simple_fact_checked_at.lt."${conv.lastInboundAt}"`)
      .select("id");
    if (claimed?.length && stateOf(conv) === "silent" && fresh(conv.lastInboundAt, nowMs) && automationMayWrite(conv, true)) {
      const [history, know] = await Promise.all([recentHistory(supabase, conv.id), loadKnowledge(supabase, conv)]);
      const { decision, usage } = await decideSimpleFact({
        businessName: conv.businessName,
        info: know.info,
        refs: know.refs,
        templates: know.templates,
        history,
      });
      await recordChekelinUsage(
        supabase,
        { businessId: conv.businessId, storeId: conv.storeId, conversationId: conv.id, kind: "simple_fact" },
        usage,
      );
      if (decision?.simpleFact && decision.reply) {
        const name = await firstNameForUser(supabase, conv.assignedTo);
        await sendAutomated(supabase, conv, `${decision.reply} ${simpleFactEnding(name)}`, true);
        factSent = true;
      }
    }
  }

  // 5 minutes without a person replying: tell the customer someone was
  // alerted, and alert the person a second time, stronger.
  if (item.notice_due) {
    const { data: claimed } = await supabase
      .from("conversations")
      .update({ wait_notice_sent_at: new Date().toISOString() })
      .eq("id", conv.id)
      .is("wait_notice_sent_at", null)
      .select("id");
    if (claimed?.length && fresh(conv.awaitingSince, nowMs)) {
      const assignee = conv.assignedTo ?? (await routeConversation(supabase, conv.id));
      const name = await firstNameForUser(supabase, assignee);
      if (!factSent && conv.botEnabled && automationMayWrite(conv, true)) {
        await sendAutomated(supabase, conv, waitNoticeLine(name), true);
      }
      await notifyConversation(
        supabase,
        { businessId: conv.businessId, storeId: conv.storeId, assignedTo: assignee },
        { title: `⏰ ${conv.contactName} sigue esperando`, body: "Lleva 5 minutos sin respuesta. Respóndele ahora.", conversationId: conv.id },
      );
    }
  }

  // 10 minutes (Negocios with 2+ people): the Gerente — or the Dueño — is
  // alerted and can reassign with one tap. Nothing is reassigned by itself.
  if (item.escalation_due) {
    const { data: claimed } = await supabase
      .from("conversations")
      .update({ escalated_at: new Date().toISOString() })
      .eq("id", conv.id)
      .is("escalated_at", null)
      .select("id");
    if (claimed?.length && fresh(conv.awaitingSince, nowMs, 2 * STALE_MS)) {
      const people = await escalationPeople(supabase, conv);
      const name = await assigneeLabel(supabase, conv.assignedTo);
      await sendPushToPeople(supabase, conv.businessId, conv.storeId, people, {
        title: `${conv.contactName} lleva 10 minutos sin respuesta`,
        body: `${name ? `Lo tiene ${name}. ` : ""}Toca para reasignar.`,
        conversationId: conv.id,
        linkExtra: "reasignar=1",
      });
    }
  }
}

// The Tienda's Gerentes; the Dueños when it has none. Never the person who
// already has the chat.
async function escalationPeople(supabase: Admin, conv: LoadedConversation): Promise<string[]> {
  const [{ data: members }, { data: storeRows }] = await Promise.all([
    supabase.from("members").select("user_id, role").eq("business_id", conv.businessId),
    supabase.from("store_members").select("user_id").eq("store_id", conv.storeId),
  ]);
  const inStore = new Set((storeRows ?? []).map((r) => r.user_id as string));
  const others = (members ?? []).filter((m) => m.user_id !== conv.assignedTo);
  const managers = others.filter((m) => m.role === "manager" && inStore.has(m.user_id)).map((m) => m.user_id as string);
  if (managers.length > 0) return managers;
  return others.filter((m) => m.role === "owner").map((m) => m.user_id as string);
}

async function assigneeLabel(supabase: Admin, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const meta = data.user?.user_metadata ?? {};
    return ((meta.full_name ?? meta.name) as string | undefined)?.trim() || data.user?.email || null;
  } catch {
    return null;
  }
}
