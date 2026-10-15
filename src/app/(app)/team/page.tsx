import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getTeamMembers } from "@/lib/team";
import { createClient } from "@/lib/supabase/server";
import { TeamView, type PendingInvitation, type StoreMembership } from "./TeamView";

export default async function TeamPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  const [members, { data: storeRows }, { data: invitationRows }] = await Promise.all([
    getTeamMembers(business.id),
    supabase.from("store_members").select("store_id, user_id").eq("business_id", business.id),
    // Dueños see every unused invitation; Gerentes the ones they made (RLS).
    business.role === "agent"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("invitations")
          .select("id, token, role, store_ids, expires_at")
          .eq("business_id", business.id)
          .is("accepted_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false }),
  ]);

  const storeMembership: StoreMembership = {};
  for (const row of storeRows ?? []) {
    (storeMembership[row.user_id] ??= []).push(row.store_id);
  }

  return (
    <TeamView
      business={business}
      members={members}
      storeMembership={storeMembership}
      invitations={(invitationRows ?? []) as PendingInvitation[]}
      currentUserId={business.userId}
    />
  );
}
