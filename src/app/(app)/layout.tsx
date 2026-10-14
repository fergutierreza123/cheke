import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getConversations } from "@/lib/conversations";
import { getProducts } from "@/lib/products";
import { getNotifications } from "@/lib/notifications";
import { AppShell } from "@/components/AppShell";
import { PushRegistrar } from "@/components/PushRegistrar";
import { WelcomeSplash } from "@/components/WelcomeSplash";
import { createClient } from "@/lib/supabase/server";

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

  // Just signed in (flag set by /auth/callback)? Greet them by first name —
  // Google gives us one; email-only accounts just get the plain greeting.
  let welcome: { firstName: string | null } | null = null;
  if ((await cookies()).get("cheke_welcome")?.value === "1") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const fullName = (user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined;
    welcome = { firstName: fullName?.trim().split(/\s+/)[0] || null };
  }

  return (
    <AppShell businessName={business.name} notificationCount={notifications.length}>
      {welcome && <WelcomeSplash firstName={welcome.firstName} businessName={business.name} />}
      <PushRegistrar />
      {children}
    </AppShell>
  );
}
