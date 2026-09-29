import { createClient } from "@/lib/supabase/server";

export type CurrentBusiness = {
  id: string;
  name: string;
  plan: string;
  inviteCode: string;
  role: "owner" | "agent";
};

// Looks up the business the signed-in user belongs to (a user belongs to
// exactly one business in this starter — extend to multi-business later).
// Returns null if they're logged in but haven't created/joined one yet.
export async function getCurrentBusiness(): Promise<CurrentBusiness | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("members")
    .select("role, businesses(id, name, plan, invite_code)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.businesses) return null;

  const business = Array.isArray(data.businesses) ? data.businesses[0] : data.businesses;
  if (!business) return null;

  return {
    id: business.id,
    name: business.name,
    plan: business.plan,
    inviteCode: business.invite_code,
    role: data.role as "owner" | "agent",
  };
}
