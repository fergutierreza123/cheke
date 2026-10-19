"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ARCHIVED_STORE_READ_ONLY, isArchivedStore } from "@/lib/business";
import { credentialsForChannel } from "@/lib/whatsapp";
import { markMessageFailed } from "@/lib/whatsappErrors";
import { markChannelNeedsReconnect } from "@/lib/channelHealth";
import { friendlyError } from "@/lib/dbErrors";
import {
  buildTemplateMessage,
  renderTemplate,
  templateProblem,
  validateTemplateValues,
  type WhatsAppTemplate,
} from "@/lib/whatsappTemplates";
import { sendTemplateMessage, syncChannelTemplates, TEMPLATE_CHANNEL_COLUMNS, type TemplateChannel } from "@/lib/whatsappTemplatesServer";
import type { Message } from "@/lib/types";

// "Enviar plantilla" in Chat: after 24 h without a message from the customer,
// WhatsApp only accepts a template Meta approved. These actions list the
// conversation's number's templates (whatsapp_templates, migration 0033),
// refresh them from Meta, and send one. The window stays closed until the
// customer answers; their answer opens a new 24 h window.

export type ChatWhatsAppTemplate = WhatsAppTemplate & { synced_at?: string };

const TEMPLATE_COLUMNS = "id, name, language, status, category, components, rejected_reason, synced_at";

// The conversation, read as the signed-in person (RLS: only someone who works
// in its Tienda gets a row).
async function loadConversation(conversationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      `id, business_id, channel_id, contact:contacts(name, phone), channel:channels(${TEMPLATE_CHANNEL_COLUMNS}), store:stores(archived_at)`,
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return { supabase, conversation: null };
  const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
  const channel = (Array.isArray(data.channel) ? data.channel[0] : data.channel) as TemplateChannel | null;
  return { supabase, conversation: { ...data, contact, channel } };
}

// The templates of the conversation's WhatsApp number, approved ones first.
export async function listWhatsAppTemplates(
  conversationId: string,
): Promise<{ templates: ChatWhatsAppTemplate[]; error?: string }> {
  const { supabase, conversation } = await loadConversation(conversationId);
  if (!conversation?.channel || conversation.channel.type !== "whatsapp") return { templates: [] };
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("channel_id", conversation.channel.id)
    .order("name");
  // Migration 0033 not run yet: no templates, no crash.
  if (error) return { templates: [], error: "Las plantillas de WhatsApp todavía no están activadas en cheke." };
  const templates = (data ?? []) as ChatWhatsAppTemplate[];
  return {
    templates: [...templates].sort((a, b) => Number(Boolean(templateProblem(a))) - Number(Boolean(templateProblem(b)))),
  };
}

// "Actualizar": reads the number's templates from Meta again.
export async function refreshWhatsAppTemplates(
  conversationId: string,
): Promise<{ templates: ChatWhatsAppTemplate[]; error?: string }> {
  const { conversation } = await loadConversation(conversationId);
  if (!conversation?.channel || conversation.channel.type !== "whatsapp") return { templates: [] };
  // The person can see this conversation (RLS above); the write itself is
  // the server's (whatsapp_templates has no write policies).
  const synced = await syncChannelTemplates(createAdminClient(), conversation.channel);
  const listed = await listWhatsAppTemplates(conversationId);
  return { templates: listed.templates, error: synced.error ?? listed.error };
}

// Sends an approved template to the customer and saves it in Chat with the
// text they'll read.
export async function sendWhatsAppTemplate(
  conversationId: string,
  templateId: string,
  values: Record<string, string>,
): Promise<{ message?: Message; error?: string; sendError?: string }> {
  const { supabase, conversation } = await loadConversation(conversationId);
  if (!conversation) return { error: "No se encontró la conversación." };
  if (isArchivedStore(conversation.store)) return { error: ARCHIVED_STORE_READ_ONLY };
  const channel = conversation.channel;
  if (!channel || channel.type !== "whatsapp") return { error: "Las plantillas solo se envían por WhatsApp." };
  if (!conversation.contact?.phone) return { error: "Este cliente no tiene número de WhatsApp." };

  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .eq("channel_id", channel.id)
    .maybeSingle();
  if (!template) return { error: "No se encontró la plantilla. Toca «Actualizar» e inténtalo de nuevo." };
  const problem = templateProblem(template as WhatsAppTemplate);
  if (problem) return { error: problem };
  const invalid = validateTemplateValues(template as WhatsAppTemplate, values);
  if (invalid) return { error: invalid };

  const text = renderTemplate(template as WhatsAppTemplate, values);
  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, business_id: conversation.business_id, direction: "out", body: text })
    .select("*")
    .single();
  if (insertError || !message) return { error: friendlyError(insertError, "No se pudo guardar el mensaje.") };
  await supabase.from("conversations").update({ last_message_at: message.created_at }).eq("id", conversationId);

  // The app reviewers' demo Negocio (modo prueba) saves without sending.
  const { data: business } = await supabase.from("businesses").select("is_demo").eq("id", conversation.business_id).maybeSingle();
  if (business?.is_demo === true) return { message };

  const result = await sendTemplateMessage(
    credentialsForChannel(channel),
    buildTemplateMessage(conversation.contact.phone, template as WhatsAppTemplate, values),
  );
  if (result.needsReconnect) await markChannelNeedsReconnect(channel.id, `whatsapp_${result.errorCode ?? "auth"}`);
  if (result.error) {
    const failed = await markMessageFailed(supabase, message.id, result);
    return { message: { ...message, ...failed }, sendError: failed.error_reason ?? result.error };
  }
  if (result.externalMessageId) {
    await supabase.from("messages").update({ external_message_id: result.externalMessageId }).eq("id", message.id);
  }
  return { message };
}
