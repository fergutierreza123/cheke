import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";

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
