import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getTeamMembers } from "@/lib/team";
import { createClient } from "@/lib/supabase/server";
import { TeamView } from "./TeamView";

export default async function TeamPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const members = await getTeamMembers(business.id);

  return (
    <TeamView
      business={business}
      members={members}
      currentUserId={user?.id ?? ""}
    />
  );
}
