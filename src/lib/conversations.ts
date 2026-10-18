import { createClient } from "@/lib/supabase/server";
import type { ConversationWithContact, Message } from "@/lib/types";
import { countUnread } from "@/lib/unread";

// The conversations of the given Tiendas (the ones on screen right now).
export async function getConversations(businessId: string, storeIds: string[]): Promise<ConversationWithContact[]> {
  if (storeIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*, contact:contacts(id, name, phone, ig_handle, fb_id, notes), channel:channels(id, type)")
    .eq("business_id", businessId)
    .in("store_id", storeIds)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  const conversations = (data ?? []) as unknown as Array<ConversationWithContact>;
  if (conversations.length === 0) return conversations;

  // One extra query for the list's message previews, instead of lazily
  // loading each conversation's messages only once it's opened — otherwise
  // every row but the selected one shows a blank preview.
  const conversationIds = conversations.map((c) => c.id);
  const [{ data: recentMessages }, { data: unreadRows, error: unreadError }] = await Promise.all([
    supabase
      .from("messages")
      .select("conversation_id, body, created_at, direction, status, is_bot, source")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
    // "No leídos" per chat (view from migration 0034, RLS applies).
    supabase.from("conversation_unread").select("conversation_id, unread_count").in("conversation_id", conversationIds),
  ]);

  const lastBodyByConversation = new Map<string, string | null>();
  const newestFirst = new Map<string, NonNullable<typeof recentMessages>>();
  for (const m of recentMessages ?? []) {
    if (!lastBodyByConversation.has(m.conversation_id)) {
      lastBodyByConversation.set(m.conversation_id, m.body);
    }
    const list = newestFirst.get(m.conversation_id) ?? [];
    list.push(m);
    newestFirst.set(m.conversation_id, list);
  }

  // Before migration 0034 runs, the view doesn't exist: count from the
  // messages already loaded for the previews instead.
  const unreadByConversation = new Map<string, number>();
  if (!unreadError) {
    for (const row of unreadRows ?? []) unreadByConversation.set(row.conversation_id, row.unread_count);
  } else {
    for (const [id, list] of newestFirst) unreadByConversation.set(id, countUnread([...list].reverse()));
  }

  return conversations.map((c) => ({
    ...c,
    last_message_body: lastBodyByConversation.get(c.id) ?? null,
    unread_count: unreadByConversation.get(c.id) ?? 0,
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
