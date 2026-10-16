import { redirect } from "next/navigation";
import { getCurrentBusiness, storeNamesForTags } from "@/lib/business";
import { getTeamMembers } from "@/lib/team";
import { getConversations } from "@/lib/conversations";
import { AnalyticsView } from "./AnalyticsView";

export default async function AnalyticsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const conversations = await getConversations(business.id, business.scopeStoreIds);
  // Per-person sales only once conversations are actually assigned to
  // someone (assignment comes later); until then the section stays hidden.
  const assigned = conversations.some((c) => c.assigned_to);
  const people = assigned
    ? (await getTeamMembers(business.id)).map((m) => ({ id: m.user_id, email: m.email }))
    : [];

  return (
    <AnalyticsView
      conversations={conversations}
      storeNames={storeNamesForTags(business)}
      people={people}
    />
  );
}
