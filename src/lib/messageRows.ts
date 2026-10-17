import type { SupabaseClient } from "@supabase/supabase-js";

// Server-only helpers the webhooks share for quoted replies (issue #51).

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
