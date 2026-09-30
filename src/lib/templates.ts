import { createClient } from "@/lib/supabase/server";
import type { Template } from "@/lib/types";

export async function getTemplates(businessId: string): Promise<Template[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
