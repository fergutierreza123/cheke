import type { SupabaseClient } from "@supabase/supabase-js";

// Server-only helpers the webhooks (and Campaña) share: quoted replies
// (issue #51) and finding the customer's conversation.

// cheke's id for the message Meta knows as `externalId`, in this Negocio.
// Null when there is nothing to quote or the original isn't in cheke.
export async function findMessageId(
  supabase: SupabaseClient,
  businessId: string,
  externalId: string | null | undefined,
): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("business_id", businessId)
    .eq("external_message_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}

// Inserts a message row. A row that quotes another is saved without the
// quote rather than lost if migration 0026 hasn't run yet (unknown column).
export async function insertMessage(supabase: SupabaseClient, row: Record<string, unknown> & { reply_to_id?: string | null }) {
  const { reply_to_id, ...rest } = row;
  if (!reply_to_id) return supabase.from("messages").insert(rest);
  const first = await supabase.from("messages").insert({ ...rest, reply_to_id });
  if (first.error?.code === "PGRST204" || first.error?.code === "42703") return supabase.from("messages").insert(rest);
  return first;
}

// The customer's conversation on this channel, created when there is none.
export async function findOrCreateConversation(
  supabase: SupabaseClient,
  channel: { id: string; business_id: string; store_id: string },
  contactId: string,
): Promise<{ id: string; last_message_at: string | null }> {
  // limit(1) instead of maybeSingle(): if a race ever created two rows,
  // maybeSingle() would error out and we'd create a third.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, last_message_at")
    .eq("business_id", channel.business_id)
    .eq("contact_id", contactId)
    .eq("channel_id", channel.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (existing?.[0]) return existing[0];

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      business_id: channel.business_id,
      store_id: channel.store_id,
      contact_id: contactId,
      channel_id: channel.id,
      status: "open",
    })
    .select("id, last_message_at")
    .single();
  if (error || !created) throw new Error(error?.message ?? "No se pudo crear la conversación.");
  return created;
}
