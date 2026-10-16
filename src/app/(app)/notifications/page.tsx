import { redirect } from "next/navigation";
import { getCurrentBusiness, storeNamesForTags } from "@/lib/business";
import { getConversations } from "@/lib/conversations";
import { getNotifications } from "@/lib/notifications";
import { NotificationsView } from "./NotificationsView";

export default async function NotificationsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const conversations = await getConversations(business.id, business.scopeStoreIds);
  const notifications = await getNotifications(business.id, business.scopeStoreIds, conversations);

  return <NotificationsView notifications={notifications} storeNames={storeNamesForTags(business)} />;
}
