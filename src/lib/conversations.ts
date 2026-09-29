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
  const conversations = (data ?? []) as unknown as Array<ConversationWithContact>;
  if (conversations.length === 0) return conversations;

  // One extra query for the list's message previews, instead of lazily
  // loading each conversation's messages only once it's opened — otherwise
  // every row but the selected one shows a blank preview.
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("conversation_id, body, created_at")
    .in(
      "conversation_id",
      conversations.map((c) => c.id),
    )
    .order("created_at", { ascending: false });

  const lastBodyByConversation = new Map<string, string | null>();
  for (const m of recentMessages ?? []) {
    if (!lastBodyByConversation.has(m.conversation_id)) {
      lastBodyByConversation.set(m.conversation_id, m.body);
    }
  }

  return conversations.map((c) => ({
    ...c,
    last_message_body: lastBodyByConversation.get(c.id) ?? null,
  }));
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
