import { createClient } from "@/lib/supabase/server";
import type { TeamMember } from "@/lib/types";

export async function getTeamMembers(businessId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("business_members", { target_business_id: businessId });

  if (error) throw new Error(error.message);
  return data ?? [];
}
