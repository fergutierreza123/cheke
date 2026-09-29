import { createClient } from "@/lib/supabase/server";
import type { ConversationWithContact, Message } from "@/lib/types";

export async function getConversations(businessId: string): Promise<ConversationWithContact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*, contact:contacts(id, name, phone, ig_handle, fb_id, notes), channel:channels(id, type)")
    .eq("business_id", businessId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ConversationWithContact[];
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
