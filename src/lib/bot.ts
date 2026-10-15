import type { SupabaseClient } from "@supabase/supabase-js";
import { generateChekelinReply } from "@/lib/ai";
import { sendOnChannel, SEND_CHANNEL_COLUMNS, SEND_CONTACT_COLUMNS } from "@/lib/channelSend";
import { replyWindow } from "@/lib/messagingWindow";
import { markMessageFailed } from "@/lib/whatsappErrors";
import type { Message } from "@/lib/types";

// Shared by the WhatsApp and Instagram/Messenger webhooks (service-role
// client, no user session) and the Chat UI's "simular mensaje de cliente"
// demo action (regular user-scoped client) — both just need a conversation that already has its
// new inbound message saved, and call this to let Chekelin answer it.
export async function runChekelinReply(
  supabase: SupabaseClient,
  conversationId: string,
  // false for the Chat "modo prueba": the reply is saved in cheke only, never
  // sent to the real customer.
  { sendExternally = true }: { sendExternally?: boolean } = {},
): Promise<{ message?: Message; error?: string; skipped?: true }> {
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select(
      `id, business_id, bot_enabled, window_expires_at, contact:contacts(${SEND_CONTACT_COLUMNS}), channel:channels(${SEND_CHANNEL_COLUMNS})`,
    )
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) return { error: convError?.message ?? "No se encontró la conversación." };
  if (!conversation.bot_enabled) return { skipped: true };

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const channel = Array.isArray(conversation.channel) ? conversation.channel[0] : conversation.channel;

  // chekelin only answers inside the 24 h window. Past it, Instagram and
  // Facebook still let a *person* reply (HUMAN_AGENT), never an automation.
  if (sendExternally && replyWindow(channel?.type, conversation.window_expires_at, Date.now()) !== "open") {
    return { skipped: true };
  }

  const [{ data: business }, { data: products }, { data: templates }, { data: history }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", conversation.business_id).single(),
    supabase.from("products").select("*").eq("business_id", conversation.business_id).eq("visible", true),
    supabase.from("templates").select("*").eq("business_id", conversation.business_id),
    supabase
      .from("messages")
      .select("direction, body")
      .eq("conversation_id", conversationId)
      // newest 20 (reversed below) — the oldest 20 would miss the message
      // the customer just sent once a conversation gets long
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const { reply, error } = await generateChekelinReply({
    businessName: business?.name ?? "el negocio",
    products: products ?? [],
    templates: templates ?? [],
    history: (history ?? []).reverse(),
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

  if (insertError || !message) return { error: insertError?.message ?? "No se pudo guardar la respuesta de chekelin." };

  await supabase.from("conversations").update({ last_message_at: message.created_at }).eq("id", conversationId);

  if (sendExternally) {
    const sendResult = await sendOnChannel({
      channel,
      contact,
      windowExpiresAt: conversation.window_expires_at,
      text: reply,
      author: "bot",
    });
    if (sendResult.error) {
      await markMessageFailed(supabase, message.id, sendResult);
    } else if (!sendResult.notSent && sendResult.externalMessageId) {
      await supabase
        .from("messages")
        .update({ external_message_id: sendResult.externalMessageId })
        .eq("id", message.id);
    }
  }

  return { message };
}
