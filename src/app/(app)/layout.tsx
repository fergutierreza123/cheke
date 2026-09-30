import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getConversations } from "@/lib/conversations";
import { getProducts } from "@/lib/products";
import { getNotifications } from "@/lib/notifications";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  // Same live computation NotificationsView uses — no persisted read
  // state, so this is "how many would show up right now", not a stored
  // unread count. Good enough for a sidebar badge; see src/lib/notifications.ts.
  const [conversations, products] = await Promise.all([
    getConversations(business.id),
    getProducts(business.id),
  ]);
  const notifications = await getNotifications(business.id, conversations, products);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      <Sidebar businessName={business.name} notificationCount={notifications.length} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
