"use server";

import { createClient } from "@/lib/supabase/server";
import {
  markReadOnChannel,
  reactionsAllowed,
  reactOnChannel,
  sendOnChannel,
  SEND_CHANNEL_COLUMNS,
  SEND_CONTACT_COLUMNS,
  type SendResult,
} from "@/lib/channelSend";
import { INSTAGRAM_REACTION } from "@/lib/messageEvents";
import { replyWindow, windowClosedMessage } from "@/lib/messagingWindow";
import { markMessageFailed } from "@/lib/whatsappErrors";
import { afterPaymentConfirmed, handleInboundMessage } from "@/lib/bot";
import { sendPushToPeople } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageStore, getCurrentBusiness } from "@/lib/business";
import { buildPaymentMessage, normalizePaymentLink, orderConcept, type OrderItem } from "@/lib/payments";
import { recordPaymentRequest } from "@/lib/orders";
import type { ConversationNote, Message } from "@/lib/types";
import { friendlyError } from "@/lib/dbErrors";

// Images sent to customers must come from our own storage, not an arbitrary
// address a client could supply.
function isOwnStorageUrl(url: string): boolean {
  try {
    return new URL(url).origin === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  } catch {
    return false;
  }
}

// The app reviewers' demo Negocio (businesses.is_demo, migration 0015) runs
// in modo prueba: replies are saved in cheKe but never sent to WhatsApp.
// If the flag can't be read, treat it as a real Negocio (send as usual).
async function isDemoBusiness(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string): Promise<boolean> {
  const { data, error } = await supabase.from("businesses").select("is_demo").eq("id", businessId).maybeSingle();
  return !error && data?.is_demo === true;
}

export async function sendChatMessage(
  conversationId: string,
  body: string,
  mediaUrl?: string | null,
  // "Responder": the message of this chat being answered (quoted).
  replyToId?: string | null,
): Promise<{ message?: Message; error?: string; sendError?: string }> {
  const text = body.trim();
  if (!text) return { error: "Escribe un mensaje." };
  if (mediaUrl && !isOwnStorageUrl(mediaUrl)) return { error: "La imagen no es válida." };

  const supabase = await createClient();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select(
      `id, business_id, window_expires_at, contact:contacts(${SEND_CONTACT_COLUMNS}), channel:channels(${SEND_CHANNEL_COLUMNS})`,
    )
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) return { error: "No se encontró la conversación." };

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const channel = Array.isArray(conversation.channel) ? conversation.channel[0] : conversation.channel;

  // Refuse up front (before saving anything) once the reply window has
  // closed (WhatsApp: 24 h; Instagram/Facebook: 7 days for a person),
  // instead of saving a message that Meta will reject.
  if (replyWindow(channel?.type, conversation.window_expires_at, Date.now()) === "closed") {
    return { error: windowClosedMessage(channel?.type) };
  }

  // The quoted message must be in this same conversation.
  let quoted: { id: string; external_message_id: string | null } | null = null;
  if (replyToId) {
    const { data } = await supabase
      .from("messages")
      .select("id, external_message_id")
      .eq("id", replyToId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    quoted = data;
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      business_id: conversation.business_id,
      direction: "out",
      body: text,
      media_url: mediaUrl ?? null,
      ...(quoted ? { reply_to_id: quoted.id } : {}),
    })
    .select("*")
    .single();

  if (insertError || !message) {
    return { error: friendlyError(insertError, "No se pudo guardar el mensaje.") };
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: message.created_at })
    .eq("id", conversationId);

  // A person just answered: the database (migration 0021) marks the chat as
  // handed off — chekelin goes silent, the timers stop, and an unassigned
  // chat becomes this person's. Nothing to do here.

  // Goes out on the conversation's own channel. Conversations without one
  // (demo/seeded) only save in cheke, as before — and so does everything in
  // the app reviewers' demo Negocio, on every network.
  const result: SendResult = (await isDemoBusiness(supabase, conversation.business_id))
    ? { notSent: true }
    : await sendOnChannel({
    channel,
    contact,
    windowExpiresAt: conversation.window_expires_at,
    text,
    mediaUrl,
    author: "human",
    replyToExternalId: quoted?.external_message_id ?? null,
  });
  if (result.error) {
    const failed = await markMessageFailed(supabase, message.id, result);
    return { message: { ...message, ...failed }, sendError: result.error };
  }
  if (!result.notSent && result.externalMessageId) {
    await supabase
      .from("messages")
      .update({ external_message_id: result.externalMessageId })
      .eq("id", message.id);
  }

  return { message };
}

// The business reacts to a message (WhatsApp: any emoji; Instagram: a
// heart). The same emoji again, or null, takes the reaction back.
export async function reactToMessage(messageId: string, emoji: string | null): Promise<{ error?: string; reaction?: string | null }> {
  const supabase = await createClient();
  const { data: message } = await supabase
    .from("messages")
    .select(
      `id, business_id, external_message_id, reaction_out, deleted_at, conversation:conversations(window_expires_at, contact:contacts(${SEND_CONTACT_COLUMNS}), channel:channels(${SEND_CHANNEL_COLUMNS}))`,
    )
    .eq("id", messageId)
    .maybeSingle();
  if (!message) return { error: "No se encontró el mensaje." };
  if (message.deleted_at) return { error: "Ese mensaje fue eliminado." };

  const conversation = Array.isArray(message.conversation) ? message.conversation[0] : message.conversation;
  const contact = Array.isArray(conversation?.contact) ? conversation.contact[0] : conversation?.contact;
  const channel = Array.isArray(conversation?.channel) ? conversation.channel[0] : conversation?.channel;

  const allowed = channel ? reactionsAllowed(channel.type) : "any";
  if (allowed === "none") return { error: "Facebook Messenger no permite reaccionar desde cheke." };
  let next = emoji && emoji === message.reaction_out ? null : emoji;
  if (next && allowed === "heart") next = INSTAGRAM_REACTION;

  if (!(await isDemoBusiness(supabase, message.business_id))) {
    const result = await reactOnChannel({
      channel,
      contact,
      windowExpiresAt: conversation?.window_expires_at ?? null,
      externalMessageId: message.external_message_id,
      emoji: next,
    });
    if (result.error) return { error: result.error };
  }

  const { error } = await supabase.from("messages").update({ reaction_out: next }).eq("id", messageId);
  if (error) return { error: friendlyError(error, "No se pudo guardar la reacción.") };
  return { reaction: next };
}

// Someone on the team opened the chat: the customer's messages show as read
// on their phone (blue ticks / "Visto"), and are marked read in cheke so the
// next open doesn't send it again.
export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = await createClient();
  const { data: unread } = await supabase
    .from("messages")
    .select("id, external_message_id")
    .eq("conversation_id", conversationId)
    .eq("direction", "in")
    .neq("status", "read")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!unread?.length) return;

  const { data: conversation } = await supabase
    .from("conversations")
    .select(`business_id, contact:contacts(${SEND_CONTACT_COLUMNS}), channel:channels(${SEND_CHANNEL_COLUMNS})`)
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return;

  await supabase
    .from("messages")
    .update({ status: "read" })
    .in(
      "id",
      unread.map((m) => m.id),
    );

  if (await isDemoBusiness(supabase, conversation.business_id)) return;
  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const channel = Array.isArray(conversation.channel) ? conversation.channel[0] : conversation.channel;
  await markReadOnChannel({
    channel,
    contact,
    latestInboundId: unread.find((m) => m.external_message_id)?.external_message_id ?? null,
  });
}

// Demo/testing only (no real WhatsApp message involved): lets the founder
// type as if they were the customer, so Chekelin's first-reply flow can be
// shown end-to-end before a real WhatsApp number is connected.
export async function simulateInboundMessage(
  conversationId: string,
  body: string,
): Promise<{ inbound?: Message; reply?: Message; error?: string }> {
  const text = body.trim();
  if (!text) return { error: "Escribe un mensaje." };

  const supabase = await createClient();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, business_id, store_id, contact:contacts(name)")
    .eq("id", conversationId)
    .single();
  if (convError || !conversation) return { error: "No se encontró la conversación." };

  const { data: inbound, error: insertError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, business_id: conversation.business_id, direction: "in", body: text })
    .select("*")
    .single();
  if (insertError || !inbound) return { error: friendlyError(insertError, "No se pudo guardar el mensaje.") };

  await supabase.from("conversations").update({ last_message_at: inbound.created_at }).eq("id", conversationId);

  // Exactly what a real message triggers (chekelin, handoff, routing, phone
  // alerts), but nothing is sent to the customer. Admin client because
  // routing and alerts read the whole team; the caller was already confirmed
  // to work in this Tienda by the RLS-scoped conversation lookup above.
  const botResult = await handleInboundMessage(createAdminClient(), conversationId, {
    sendExternally: false,
    preview: text,
  });
  if (botResult.error) return { inbound, error: botResult.error };
  return { inbound, reply: botResult.message };
}

// "Asignación": a Dueño or the Tienda's Gerente gives the chat to someone
// else (the one-tap reassign of the 10-minute alert). The new person is
// alerted and gets a fresh 5 minutes before the timers run again.
export async function reassignConversation(conversationId: string, userId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, store_id, awaiting_since, contact:contacts(name)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return { error: "No se encontró la conversación." };
  if (!canManageStore(business, conversation.store_id)) return { error: "Solo el dueño o el gerente puede reasignar." };

  const admin = createAdminClient();
  const [{ data: member }, { data: inStore }] = await Promise.all([
    admin.from("members").select("role").eq("business_id", business.id).eq("user_id", userId).maybeSingle(),
    admin.from("store_members").select("user_id").eq("store_id", conversation.store_id).eq("user_id", userId).maybeSingle(),
  ]);
  if (!member || (member.role !== "owner" && !inStore)) return { error: "Esa persona no trabaja en esta tienda." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("conversations")
    .update({
      assigned_to: userId,
      assigned_at: now,
      last_assigned_to: userId,
      escalated_at: null,
      ...(conversation.awaiting_since ? { awaiting_since: now } : {}),
    })
    .eq("id", conversationId);
  if (error) return { error: friendlyError(error, "No se pudo reasignar el chat.") };

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  await sendPushToPeople(admin, business.id, conversation.store_id, [userId], {
    title: `Te asignaron el chat de ${contact?.name ?? "un cliente"}`,
    body: conversation.awaiting_since ? "Está esperando respuesta." : "Ahora es tuyo.",
    conversationId,
  });
  return {};
}

// The team-only notes of a conversation (chekelin's Traspaso summary).
export async function listConversationNotes(conversationId: string): Promise<ConversationNote[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversation_notes")
    .select("id, conversation_id, store_id, kind, summary, reason, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as ConversationNote[];
}

export type OpenOrder = {
  id: string;
  total_hnl: number;
  concept: string;
  payment_link: string | null;
  created_at: string;
  // chekelin took it (vs. a person's Cobrar).
  by_chekelin?: boolean;
  // The customer sent a receipt / said they paid: waiting for "Confirmar pago".
  receipt_at?: string | null;
};

// Orders waiting on payment for one conversation (shown above the composer).
export async function listOpenOrders(conversationId: string): Promise<OpenOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, total_hnl, items, payment_link, created_at, source, receipt_at")
    .eq("conversation_id", conversationId)
    .eq("status", "awaiting_payment")
    .order("created_at", { ascending: false });

  return (data ?? []).map((o) => ({
    id: o.id,
    total_hnl: Number(o.total_hnl),
    concept: Array.isArray(o.items) ? orderConcept(o.items as OrderItem[]) : "",
    payment_link: o.payment_link,
    created_at: o.created_at,
    by_chekelin: o.source === "chekelin",
    receipt_at: o.receipt_at ?? null,
  }));
}

// Sends the customer a payment request (link and/or transfer details) and
// records it as an order awaiting payment. The order is only created once the
// message actually went out, so a failed send never leaves a phantom charge.
export async function sendPaymentRequest(
  conversationId: string,
  input: { concept: string; amountHnl: number; link?: string; instructions?: string },
): Promise<{ order?: OpenOrder; message?: Message; error?: string }> {
  const concept = input.concept.trim();
  if (!concept) return { error: "Escribe el concepto del cobro." };
  if (!Number.isFinite(input.amountHnl) || input.amountHnl <= 0) return { error: "Escribe un monto válido." };

  const linkCheck = normalizePaymentLink(input.link ?? "");
  if (linkCheck.error) return { error: linkCheck.error };
  const instructions = input.instructions?.trim() || undefined;
  if (!linkCheck.link && !instructions) {
    return { error: "Agrega un link de pago o las instrucciones para pagar (cuenta, transferencia…)." };
  }

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, business_id, contact_id, stage")
    .eq("id", conversationId)
    .single();
  if (!conversation) return { error: "No se encontró la conversación." };

  const text = buildPaymentMessage({ concept, amountHnl: input.amountHnl, link: linkCheck.link, instructions });
  const sent = await sendChatMessage(conversationId, text);
  if (sent.error || sent.sendError) return { message: sent.message, error: sent.error ?? sent.sendError };

  const order = await recordPaymentRequest(supabase, {
    conversationId,
    businessId: conversation.business_id,
    contactId: conversation.contact_id,
    stage: conversation.stage,
    items: [{ name: concept, quantity: 1, price_hnl: input.amountHnl }],
    totalHnl: input.amountHnl,
    link: linkCheck.link ?? null,
    source: "cheke",
  });
  // The customer already has the message, so don't fail the send — just say
  // the tracking part didn't save so the agent can mark it manually.
  if (!order) {
    return { message: sent.message, error: "El mensaje se envió, pero no se pudo registrar el cobro en cheke." };
  }

  return {
    message: sent.message,
    order: { ...order, concept },
  };
}

// "Confirmar pago": a person checked the money arrived (or the charge was
// dropped). Paid moves the deal to "ganado" so Chekeo and Analítica reflect
// the sale, and on an order chekelin took, chekelin tells the customer.
export async function resolveOrder(
  orderId: string,
  outcome: "paid" | "cancelled",
): Promise<{ error?: string; customerTold?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The signed-in client: only someone who works in the order's Tienda can do it (RLS).
  const { data: order, error } = await supabase
    .from("orders")
    .update(outcome === "paid" ? { status: "paid", paid_at: new Date().toISOString(), paid_by: user?.id ?? null } : { status: outcome })
    .eq("id", orderId)
    .eq("status", "awaiting_payment")
    .select("id, conversation_id")
    .maybeSingle();
  if (error) return { error: friendlyError(error, "No se pudo actualizar el cobro.") };
  if (!order) return { error: "Este cobro ya fue actualizado." };

  if (outcome === "paid" && order.conversation_id) {
    const { told } = await afterPaymentConfirmed(createAdminClient(), order.id);
    return { customerTold: told };
  }
  return {};
}

// "Marcar queja resuelta": the Tienda's Gerente or a Dueño closes the Queja.
// The red tag goes away; chekelin may answer here again by the usual rules
// (chat closed, won or lost, 7 days of silence, or switched back on here).
export async function resolveComplaint(conversationId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  const supabase = await createClient();
  const { data: conversation } = await supabase.from("conversations").select("id, store_id").eq("id", conversationId).maybeSingle();
  if (!conversation) return { error: "No se encontró la conversación." };
  if (!canManageStore(business, conversation.store_id)) {
    return { error: "Solo el gerente o el dueño puede marcar la queja como resuelta." };
  }
  const { error } = await supabase
    .from("conversations")
    .update({ complaint_open_at: null, complaint_resolved_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) return { error: friendlyError(error, "No se pudo marcar la queja como resuelta.") };
  return {};
}
