"use server";

import { createClient } from "@/lib/supabase/server";
import { credentialsForChannel, sendWhatsAppMessage } from "@/lib/whatsapp";
import { isWhatsAppWindowClosed, WINDOW_CLOSED_MESSAGE } from "@/lib/whatsappWindow";
import { runChekelinReply } from "@/lib/bot";
import { sendPushToBusiness } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPaymentMessage, normalizePaymentLink } from "@/lib/payments";
import type { ConversationStage, Message } from "@/lib/types";

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
): Promise<{ message?: Message; error?: string; sendError?: string; botDisabled?: boolean }> {
  const text = body.trim();
  if (!text) return { error: "Escribe un mensaje." };
  if (mediaUrl && !isOwnStorageUrl(mediaUrl)) return { error: "La imagen no es válida." };

  const supabase = await createClient();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, business_id, bot_enabled, window_expires_at, contact:contacts(phone), channel:channels(type, external_id, access_token_encrypted)")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) return { error: "No se encontró la conversación." };

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const channel = Array.isArray(conversation.channel) ? conversation.channel[0] : conversation.channel;

  // Refuse up front (before saving anything) once WhatsApp's 24h reply window
  // has closed, instead of saving a message that Meta will reject.
  if (channel?.type === "whatsapp" && isWhatsAppWindowClosed(conversation.window_expires_at, Date.now())) {
    return { error: WINDOW_CLOSED_MESSAGE };
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      business_id: conversation.business_id,
      direction: "out",
      body: text,
      media_url: mediaUrl ?? null,
    })
    .select("*")
    .single();

  if (insertError || !message) {
    return { error: insertError?.message ?? "No se pudo guardar el mensaje." };
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: message.created_at })
    .eq("id", conversationId);

  // A human agent just answered manually — hand off from Chekelin so it
  // doesn't also reply to the same conversation.
  let botDisabled = false;
  if (conversation.bot_enabled) {
    await supabase.from("conversations").update({ bot_enabled: false }).eq("id", conversationId);
    botDisabled = true;
  }

  // Only WhatsApp actually sends anywhere right now — Instagram/Facebook
  // messaging is Phase 7. Everything still saves to the conversation either
  // way, same as the demo-seeded conversations.
  if (channel?.type === "whatsapp" && contact?.phone && !(await isDemoBusiness(supabase, conversation.business_id))) {
    const result = await sendWhatsAppMessage(contact.phone, text, credentialsForChannel(channel), mediaUrl);

    if (result.error) {
      await supabase.from("messages").update({ status: "failed" }).eq("id", message.id);
      return { message: { ...message, status: "failed" }, sendError: result.error, botDisabled };
    }
    if (result.externalMessageId) {
      await supabase
        .from("messages")
        .update({ external_message_id: result.externalMessageId })
        .eq("id", message.id);
    }
  }

  return { message, botDisabled };
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
    .select("id, business_id, contact:contacts(name)")
    .eq("id", conversationId)
    .single();
  if (convError || !conversation) return { error: "No se encontró la conversación." };

  const { data: inbound, error: insertError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, business_id: conversation.business_id, direction: "in", body: text })
    .select("*")
    .single();
  if (insertError || !inbound) return { error: insertError?.message ?? "No se pudo guardar el mensaje." };

  await supabase.from("conversations").update({ last_message_at: inbound.created_at }).eq("id", conversationId);

  // Same phone alert a real WhatsApp message would trigger, so test mode can
  // demo notifications before WhatsApp is connected. Admin client because
  // the push has to read every teammate's phone, not just the caller's; the
  // caller was already confirmed to belong to this business by the RLS-
  // scoped conversation lookup above.
  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  await sendPushToBusiness(createAdminClient(), conversation.business_id, {
    title: contact?.name ?? "Nuevo mensaje",
    body: text,
    conversationId,
  });

  const botResult = await runChekelinReply(supabase, conversationId, { sendExternally: false });
  if (botResult.error) return { inbound, error: botResult.error };
  return { inbound, reply: botResult.message };
}

export type OpenOrder = {
  id: string;
  total_hnl: number;
  concept: string;
  payment_link: string | null;
  created_at: string;
};

// Orders waiting on payment for one conversation (shown above the composer).
export async function listOpenOrders(conversationId: string): Promise<OpenOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, total_hnl, items, payment_link, created_at")
    .eq("conversation_id", conversationId)
    .eq("status", "awaiting_payment")
    .order("created_at", { ascending: false });

  return (data ?? []).map((o) => ({
    id: o.id,
    total_hnl: Number(o.total_hnl),
    concept: Array.isArray(o.items) ? (o.items[0]?.name ?? "") : "",
    payment_link: o.payment_link,
    created_at: o.created_at,
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

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      business_id: conversation.business_id,
      conversation_id: conversationId,
      contact_id: conversation.contact_id,
      items: [{ name: concept, quantity: 1, price_hnl: input.amountHnl }],
      total_hnl: input.amountHnl,
      status: "awaiting_payment",
      payment_link: linkCheck.link ?? null,
    })
    .select("id, total_hnl, items, payment_link, created_at")
    .single();
  // The customer already has the message, so don't fail the send — just say
  // the tracking part didn't save so the agent can mark it manually.
  if (orderError || !order) {
    return { message: sent.message, error: "El mensaje se envió, pero no se pudo registrar el cobro en cheke." };
  }

  // A deal that's being charged is at least in negotiation, and its value is
  // what's being charged. Never moves a won/lost deal backwards.
  const earlyStages: ConversationStage[] = ["nuevo", "consulta", "cotizacion"];
  await supabase
    .from("conversations")
    .update({
      value_hnl: input.amountHnl,
      ...(earlyStages.includes(conversation.stage as ConversationStage) ? { stage: "negociacion" } : {}),
    })
    .eq("id", conversationId);

  return {
    message: sent.message,
    order: {
      id: order.id,
      total_hnl: Number(order.total_hnl),
      concept,
      payment_link: order.payment_link,
      created_at: order.created_at,
    },
  };
}

// The agent confirms the customer paid (or the charge was dropped). Paid also
// moves the deal to "ganado" so Chekeo and Analítica reflect the sale.
export async function resolveOrder(orderId: string, outcome: "paid" | "cancelled"): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .update({ status: outcome })
    .eq("id", orderId)
    .eq("status", "awaiting_payment")
    .select("conversation_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!order) return { error: "Este cobro ya fue actualizado." };

  if (outcome === "paid" && order.conversation_id) {
    await supabase.from("conversations").update({ stage: "ganado" }).eq("id", order.conversation_id);
  }
  return {};
}
