import type { SupabaseClient } from "@supabase/supabase-js";

// The word the person must type to confirm deleting their account.
export const DELETE_CONFIRM_WORD = "ELIMINAR";

// What happens to each Negocio a person belongs to when they delete their
// account:
// - "leave": someone else stays in charge (another Dueño, or the person is
//   an Agente) — only their membership goes away.
// - "delete": they are the Negocio's only member — the whole Negocio and all
//   its data go with them (nobody would be left to use or delete it).
// - "blocked": they are the only Dueño but other people are still on the
//   team — they must make someone else Dueño first, so the team isn't left
//   with a Negocio nobody can manage.
export type DeletionOutcome = "leave" | "delete" | "blocked";

export type DeletionPlanItem = { businessId: string; businessName: string; outcome: DeletionOutcome };

// Works with the signed-in user's client (Row Level Security lets members
// read their own Negocio's roster) or the admin client.
export async function getDeletionPlan(supabase: SupabaseClient, userId: string): Promise<DeletionPlanItem[]> {
  const { data: memberships, error } = await supabase
    .from("members")
    .select("business_id, role, businesses(name)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!memberships?.length) return [];

  const businessIds = memberships.map((m) => m.business_id as string);
  const { data: roster, error: rosterError } = await supabase
    .from("members")
    .select("business_id, user_id, role")
    .in("business_id", businessIds);
  if (rosterError) throw new Error(rosterError.message);

  return memberships.map((m) => {
    const others = (roster ?? []).filter((r) => r.business_id === m.business_id && r.user_id !== userId);
    const otherOwners = others.filter((r) => r.role === "owner");
    const business = Array.isArray(m.businesses) ? m.businesses[0] : m.businesses;
    let outcome: DeletionOutcome = "leave";
    if (others.length === 0) outcome = "delete";
    else if (m.role === "owner" && otherOwners.length === 0) outcome = "blocked";
    return {
      businessId: m.business_id as string,
      businessName: (business as { name?: string } | null)?.name ?? "tu negocio",
      outcome,
    };
  });
}
