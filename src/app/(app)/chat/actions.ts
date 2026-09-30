"use server";

import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import type { ConversationStage, Message } from "@/lib/types";

export async function sendChatMessage(
  conversationId: string,
  body: string,
): Promise<{ message?: Message; error?: string; sendError?: string }> {
  const text = body.trim();
  if (!text) return { error: "Escribe un mensaje." };

  const supabase = await createClient();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, business_id, contact:contacts(phone), channel:channels(type)")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) return { error: "No se encontró la conversación." };

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const channel = Array.isArray(conversation.channel) ? conversation.channel[0] : conversation.channel;

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, business_id: conversation.business_id, direction: "out", body: text })
    .select("*")
    .single();

  if (insertError || !message) {
    return { error: insertError?.message ?? "No se pudo guardar el mensaje." };
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: message.created_at })
    .eq("id", conversationId);

  // Only WhatsApp actually sends anywhere right now — Instagram/Facebook
  // messaging is Phase 7. Everything still saves to the conversation either
  // way, same as the demo-seeded conversations.
  if (channel?.type === "whatsapp" && contact?.phone) {
    const result = await sendWhatsAppMessage(contact.phone, text);

    if (result.error) {
      await supabase.from("messages").update({ status: "failed" }).eq("id", message.id);
      return { message: { ...message, status: "failed" }, sendError: result.error };
    }
    if (result.externalMessageId) {
      await supabase
        .from("messages")
        .update({ external_message_id: result.externalMessageId })
        .eq("id", message.id);
    }
  }

  return { message };
}

export async function setConversationStage(
  conversationId: string,
  stage: ConversationStage,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("conversations").update({ stage }).eq("id", conversationId);
  if (error) return { error: error.message };
  return {};
}
