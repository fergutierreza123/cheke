"use server";

import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { runChekelinReply } from "@/lib/bot";
import type { Message } from "@/lib/types";

export async function sendChatMessage(
  conversationId: string,
  body: string,
  mediaUrl?: string | null,
): Promise<{ message?: Message; error?: string; sendError?: string; botDisabled?: boolean }> {
  const text = body.trim();
  if (!text) return { error: "Escribe un mensaje." };

  const supabase = await createClient();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, business_id, bot_enabled, contact:contacts(phone), channel:channels(type)")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) return { error: "No se encontró la conversación." };

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const channel = Array.isArray(conversation.channel) ? conversation.channel[0] : conversation.channel;

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
  if (channel?.type === "whatsapp" && contact?.phone) {
    const result = await sendWhatsAppMessage(contact.phone, text);

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
    .select("id, business_id")
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

  const botResult = await runChekelinReply(supabase, conversationId);
  if (botResult.error) return { inbound, error: botResult.error };
  return { inbound, reply: botResult.message };
}
