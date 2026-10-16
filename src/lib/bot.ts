import type { SupabaseClient } from "@supabase/supabase-js";
import { decideChekelin, type HandoffReason } from "@/lib/ai";
import { sendOnChannel, SEND_CHANNEL_COLUMNS, SEND_CONTACT_COLUMNS, type SendChannel, type SendContact } from "@/lib/channelSend";
import { replyWindow } from "@/lib/messagingWindow";
import { markMessageFailed } from "@/lib/whatsappErrors";
import { notifyConversation, sendPushToPeople } from "@/lib/push";
import { canUseChekelin } from "@/lib/plan";
import {
  chekelinChatState,
  firstNameOf,
  handoffLine,
  introLine,
  simpleFactEnding,
  waitNoticeLine,
} from "@/lib/chekelinState";
import type { Message } from "@/lib/types";

// chekelin as first responder, the Traspaso (handoff) to a person, routing
// and the 5 / 10 minute timers. Design: issue #28 (closing comment).
//
// Server-only, and always with the service-role client (the webhooks, the
// timers cron job, or a server action after it checked the person's access):
// routing reads the whole team and writes on their behalf.
//
// The conversation's bookkeeping (customer wrote, a person replied, chekelin
// coming back after a close or 7 days) is kept by a database trigger
// (migration 0021); this file decides and speaks.

type Admin = SupabaseClient;

const CONVERSATION_COLUMNS = `id, business_id, store_id, bot_enabled, handed_off_at, chekelin_replies, assigned_to, window_expires_at, last_inbound_at, awaiting_since, contact:contacts(name, ${SEND_CONTACT_COLUMNS}), channel:channels(${SEND_CHANNEL_COLUMNS}), store:stores(chekelin_off_until), business:businesses(name, plan, is_demo)`;

type LoadedConversation = {
  id: string;
  businessId: string;
  storeId: string;
  botEnabled: boolean;
  handedOffAt: string | null;
  chekelinReplies: number;
  assignedTo: string | null;
  windowExpiresAt: string | null;
  lastInboundAt: string | null;
  awaitingSince: string | null;
  contactName: string;
  contact: SendContact | null;
  channel: SendChannel | null;
  storeOffUntil: string | null;
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
  const store = one(data.store as unknown) as { chekelin_off_until: string | null } | null;
  const business = one(data.business as unknown) as { name: string; plan: string; is_demo?: boolean } | null;
  return {
    id: data.id,
    businessId: data.business_id,
    storeId: data.store_id,
    botEnabled: data.bot_enabled,
    handedOffAt: data.handed_off_at,
    chekelinReplies: data.chekelin_replies ?? 0,
    assignedTo: data.assigned_to,
    windowExpiresAt: data.window_expires_at,
    lastInboundAt: data.last_inbound_at,
    awaitingSince: data.awaiting_since,
    contactName: contact?.name ?? "Un cliente",
    contact,
    channel: one(data.channel as unknown) as SendChannel | null,
    storeOffUntil: store?.chekelin_off_until ?? null,
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
    nowMs: Date.now(),
  });
}

// An automation (chekelin, the 5-minute notice) may only write while the
// customer's reply window is open.
function automationMayWrite(conv: LoadedConversation, sendExternally: boolean): boolean {
  return !sendExternally || replyWindow(conv.channel?.type, conv.windowExpiresAt, Date.now()) === "open";
}

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
): Promise<Message | null> {
  const { data: message, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conv.id, business_id: conv.businessId, direction: "out", body: text, is_bot: true, status: "sent" })
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
    .select("direction, body")
    .eq("conversation_id", conversationId)
    // newest 20, reversed below
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).reverse();
}

async function businessInfo(supabase: Admin, conv: LoadedConversation) {
  const [{ data: products }, { data: templates }] = await Promise.all([
    // The catalog of the conversation's own Tienda; templates are Negocio-wide.
    supabase.from("products").select("*").eq("store_id", conv.storeId).eq("visible", true),
    supabase.from("templates").select("*").eq("business_id", conv.businessId),
  ]);
  return { products: products ?? [], templates: templates ?? [] };
}

export const HANDOFF_REASON_LABEL: Record<HandoffReason | "tres_respuestas" | "chekelin_apagado", string> = {
  pide_persona: "Pidió hablar con una persona",
  quiere_comprar: "Quiere comprar, pedir o pagar",
  falta_info: "chekelin no tenía la información",
  molesto: "El cliente está molesto o se quejó",
  ninguna: "chekelin ya respondió 3 veces",
  tres_respuestas: "chekelin ya respondió 3 veces",
  chekelin_apagado: "chekelin se apagó en la tienda",
};

// The Traspaso: assign a person, tell the customer who will help them, leave
// the team-only summary note, start the 5-minute timer and alert the person.
async function handOff(
  supabase: Admin,
  conv: LoadedConversation,
  input: { summary: string; reason: string; intro: boolean; sendExternally: boolean },
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
    const text = `${input.intro ? `${introLine(conv.businessName)} ` : ""}${handoffLine(name)}`;
    message = await sendAutomated(supabase, conv, text, input.sendExternally);
  }

  await notifyConversation(
    supabase,
    { businessId: conv.businessId, storeId: conv.storeId, assignedTo: assignee },
    { title: `${conv.contactName} te espera`, body: `chekelin te pasó el chat: ${input.summary || input.reason}`, conversationId: conv.id },
  );
  return message;
}

// A customer message was just saved. chekelin answers it or hands it off;
// when chekelin isn't the first responder here (handed off, paused, off in
// the Tienda, not in the plan), the conversation goes to a person and they
// are notified.
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

  if (state === "active" && automationMayWrite(conv, sendExternally)) {
    const result = await runFirstResponder(supabase, conv, sendExternally, preview);
    if (!result.error) return result;
    // chekelin couldn't answer (no API key, an outage…): a person takes it,
    // without saying anything to the customer.
    console.error("chekelin first responder error", result.error);
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
    { title: conv.contactName, body: preview ?? "Nuevo mensaje", conversationId: conv.id },
  );
  return {};
}

async function runFirstResponder(
  supabase: Admin,
  conv: LoadedConversation,
  sendExternally: boolean,
  preview: string | null | undefined,
): Promise<{ message?: Message; error?: string }> {
  const [history, info] = await Promise.all([recentHistory(supabase, conv.id), businessInfo(supabase, conv)]);
  const isFirstReply = conv.chekelinReplies === 0;
  const { decision, error } = await decideChekelin({
    mode: "first_responder",
    businessName: conv.businessName,
    products: info.products,
    templates: info.templates,
    history,
    isFirstReply,
  });
  if (!decision) return { error };

  // After 3 replies chekelin always passes the chat to a person.
  const tooMany = conv.chekelinReplies >= 3;
  if (decision.handoff || tooMany || !decision.reply) {
    const reasonKey = decision.handoff ? decision.reason : "tres_respuestas";
    const message = await handOff(supabase, conv, {
      summary: decision.summary,
      reason: HANDOFF_REASON_LABEL[reasonKey],
      intro: isFirstReply,
      sendExternally,
    });
    return message ? { message } : {};
  }

  let text = decision.reply;
  if (isFirstReply && !/chekelin/i.test(text)) text = `${introLine(conv.businessName)} ${text}`;
  const message = await sendAutomated(supabase, conv, text, sendExternally);

  // chekelin answered: the customer isn't waiting on a person (unless they
  // wrote again meanwhile).
  let clear = supabase
    .from("conversations")
    .update({ chekelin_replies: conv.chekelinReplies + 1, awaiting_since: null, simple_fact_checked_at: conv.lastInboundAt })
    .eq("id", conv.id);
  clear = conv.lastInboundAt ? clear.eq("last_inbound_at", conv.lastInboundAt) : clear;
  const { data: cleared } = await clear.select("id");
  if (!cleared?.length) {
    await supabase.from("conversations").update({ chekelin_replies: conv.chekelinReplies + 1 }).eq("id", conv.id);
  }

  // Nobody is interrupted while chekelin handles it, except Dueños with
  // "avisarme de todo".
  await notifyConversation(
    supabase,
    { businessId: conv.businessId, storeId: conv.storeId, assignedTo: null, chekelinHandling: true },
    { title: conv.contactName, body: preview ?? "Nuevo mensaje", conversationId: conv.id },
  );
  return message ? { message } : {};
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
        intro: false,
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
  // customer's last message. Only price, stock, colors, sizes, shipping,
  // payment methods.
  if (item.facts_due && conv.lastInboundAt) {
    const { data: claimed } = await supabase
      .from("conversations")
      .update({ simple_fact_checked_at: conv.lastInboundAt })
      .eq("id", conv.id)
      .or(`simple_fact_checked_at.is.null,simple_fact_checked_at.lt."${conv.lastInboundAt}"`)
      .select("id");
    if (claimed?.length && stateOf(conv) === "silent" && fresh(conv.lastInboundAt, nowMs) && automationMayWrite(conv, true)) {
      const [history, info] = await Promise.all([recentHistory(supabase, conv.id), businessInfo(supabase, conv)]);
      const { decision } = await decideChekelin({
        mode: "simple_facts",
        businessName: conv.businessName,
        products: info.products,
        templates: info.templates,
        history,
      });
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
