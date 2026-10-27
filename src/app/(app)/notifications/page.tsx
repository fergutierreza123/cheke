import { redirect } from "next/navigation";
import { getCurrentBusiness, storeNamesForTags } from "@/lib/business";
import { getConversations } from "@/lib/conversations";
import { getNotifications } from "@/lib/notifications";
import { getTeamMembers } from "@/lib/team";
import { NotificationsView } from "./NotificationsView";

export default async function NotificationsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const conversations = await getConversations(business.id, business.scopeStoreIds);
  const notifications = await getNotifications(business.id, business.scopeStoreIds, conversations);

  // "Avisarme de todo" (Dueños only): lives here, where people look for avisos.
  const members = business.role === "owner" ? await getTeamMembers(business.id) : [];
  const me = members.find((m) => m.user_id === business.userId);

  return (
    <NotificationsView
      notifications={notifications}
      storeNames={storeNamesForTags(business)}
      notifyAll={me ? { on: Boolean(me.notify_all), team: members.length >= 2 } : null}
    />
  );
}
