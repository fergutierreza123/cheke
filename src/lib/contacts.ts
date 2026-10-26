import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";
import { tagsInUse } from "@/lib/tags";

export async function getContacts(businessId: string): Promise<Contact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Every Etiqueta used in the Negocio, for suggestions in Chat.
// shortcut: reads every contact's tags; move to a SQL distinct unnest if a Negocio passes ~50k contacts.
export async function getBusinessTags(businessId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contacts").select("tags").eq("business_id", businessId);
  if (error) throw new Error(error.message);
  return tagsInUse(data ?? []);
}
