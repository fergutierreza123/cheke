import { redirect } from "next/navigation";
import { getCurrentBusiness, storeNamesForTags } from "@/lib/business";
import { getConversations } from "@/lib/conversations";
import { getProducts } from "@/lib/products";
import { getNotifications } from "@/lib/notifications";
import { NotificationsView } from "./NotificationsView";

export default async function NotificationsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const [conversations, products] = await Promise.all([
    getConversations(business.id, business.scopeStoreIds),
    getProducts(business.id, business.scopeStoreIds),
  ]);
  const notifications = await getNotifications(business.id, business.scopeStoreIds, conversations, products);

  return <NotificationsView notifications={notifications} storeNames={storeNamesForTags(business)} />;
}
