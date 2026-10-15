import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getConversations } from "@/lib/conversations";
import { getProducts } from "@/lib/products";
import { getNotifications } from "@/lib/notifications";
import { AppShell } from "@/components/AppShell";
import { PushRegistrar } from "@/components/PushRegistrar";
import { NativeAppProvider } from "@/components/NativeApp";
import { OfflineBanner } from "@/components/OfflineBanner";
import { isNativeAppRequest } from "@/lib/nativeAppServer";
import { isPlanActive, PLAN_LAPSED_MESSAGE } from "@/lib/plan";
import { WelcomeSplash } from "@/components/WelcomeSplash";
import { createClient } from "@/lib/supabase/server";
import { userInfoFrom } from "@/lib/user";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Just signed in (flag set by /auth/callback)? Greet them by first name —
  // Google gives us one; email-only accounts just get the plain greeting.
  let welcome: { firstName: string | null } | null = null;
  if ((await cookies()).get("cheke_welcome")?.value === "1") {
    const fullName = (user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined;
    welcome = { firstName: fullName?.trim().split(/\s+/)[0] || null };
  }

  return (
    <NativeAppProvider isNative={await isNativeAppRequest()}>
      <AppShell businessName={business.name} notificationCount={notifications.length} user={userInfoFrom(user)}>
        {welcome && <WelcomeSplash firstName={welcome.firstName} businessName={business.name} />}
        <PushRegistrar />
        <OfflineBanner />
        {!isPlanActive(business.plan) && (
          // Deliberately neutral: no price, link or "how to pay", so it's
          // allowed inside the store apps too. A web-only renew button
          // would go next to it inside <HideInNativeApp>.
          <div role="status" className="shrink-0 bg-surface-2 px-4 py-2 text-center text-[12.5px] font-medium text-ink-muted">
            {PLAN_LAPSED_MESSAGE}
          </div>
        )}
        {children}
      </AppShell>
    </NativeAppProvider>
  );
}
