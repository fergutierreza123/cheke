import type { SupabaseClient } from "@supabase/supabase-js";
import { generateChekelinReply } from "@/lib/ai";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import type { Message } from "@/lib/types";

// Shared by the WhatsApp webhook (service-role client, no user session) and
// the Chat UI's "simular mensaje de cliente" demo action (regular
// user-scoped client) — both just need a conversation that already has its
// new inbound message saved, and call this to let Chekelin answer it.
export async function runChekelinReply(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ message?: Message; error?: string; skipped?: true }> {
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, business_id, bot_enabled, contact:contacts(phone), channel:channels(type)")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) return { error: convError?.message ?? "No se encontró la conversación." };
  if (!conversation.bot_enabled) return { skipped: true };

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const channel = Array.isArray(conversation.channel) ? conversation.channel[0] : conversation.channel;

  const [{ data: business }, { data: products }, { data: templates }, { data: history }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", conversation.business_id).single(),
    supabase.from("products").select("*").eq("business_id", conversation.business_id).eq("visible", true),
    supabase.from("templates").select("*").eq("business_id", conversation.business_id),
    supabase
      .from("messages")
      .select("direction, body")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  const { reply, error } = await generateChekelinReply({
    businessName: business?.name ?? "el negocio",
    products: products ?? [],
    templates: templates ?? [],
    history: history ?? [],
  });

  if (!reply) return { error };

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      business_id: conversation.business_id,
      direction: "out",
      body: reply,
      is_bot: true,
      status: "sent",
    })
    .select("*")
    .single();

  if (insertError || !message) return { error: insertError?.message ?? "No se pudo guardar la respuesta de Chekelin." };

  await supabase.from("conversations").update({ last_message_at: message.created_at }).eq("id", conversationId);

  if (channel?.type === "whatsapp" && contact?.phone) {
    const sendResult = await sendWhatsAppMessage(contact.phone, reply);
    if (sendResult.error) {
      await supabase.from("messages").update({ status: "failed" }).eq("id", message.id);
    } else if (sendResult.externalMessageId) {
      await supabase
        .from("messages")
        .update({ external_message_id: sendResult.externalMessageId })
        .eq("id", message.id);
    }
  }

  return { message };
}
