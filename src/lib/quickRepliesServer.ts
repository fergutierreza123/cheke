import { createClient } from "@/lib/supabase/server";
import type { QuickReply } from "@/lib/quickReplies";

// The Negocio's Respuestas rápidas, by shortcut.
export async function getQuickReplies(businessId: string): Promise<QuickReply[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quick_replies")
    .select("id, shortcut, body")
    .eq("business_id", businessId)
    .order("shortcut", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
