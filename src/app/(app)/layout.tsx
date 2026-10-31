import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentBusiness, showsServices } from "@/lib/business";
import { getConversations } from "@/lib/conversations";
import { getNotifications } from "@/lib/notifications";
import { AppShell } from "@/components/AppShell";
import { PushRegistrar } from "@/components/PushRegistrar";
import { BiometricSessionSync } from "@/components/BiometricSessionSync";
import { NativeAppProvider } from "@/components/NativeApp";
import { OfflineBanner } from "@/components/OfflineBanner";
import { isNativeAppRequest } from "@/lib/nativeAppServer";
import { isPlanActive, PLAN_LAPSED_MESSAGE } from "@/lib/plan";
import { WelcomeSplash } from "@/components/WelcomeSplash";
import { createClient } from "@/lib/supabase/server";
import { userInfoFrom } from "@/lib/user";
import { ArchivedStoreBanner } from "@/components/ArchivedStoreBanner";

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
  const conversations = await getConversations(business.id, business.scopeStoreIds);
  const notifications = await getNotifications(business.id, business.scopeStoreIds, conversations);

  // People in 2+ Tiendas get the store selector; everyone else sees the
  // app exactly as a single-Tienda Negocio always has.
  const archivedSelected = business.selectedStore?.archived ? business.selectedStore : null;
  const storeSwitcher = business.multiStore
    ? { stores: business.stores, selected: business.selected, archivedSelected, canManage: business.role === "owner" }
    : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Just signed in (flag set by finishSignIn after the login code)? Greet them by first name —
  // (the one given at onboarding or in Mi cuenta), or the plain greeting.
  let welcome: { firstName: string | null } | null = null;
  if ((await cookies()).get("cheke_welcome")?.value === "1") {
    const fullName = (user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined;
    welcome = { firstName: fullName?.trim().split(/\s+/)[0] || null };
  }

  return (
    <NativeAppProvider isNative={await isNativeAppRequest()}>
      <AppShell
        businessName={business.name}
        notificationCount={notifications.length}
        user={userInfoFrom(user)}
        storeSwitcher={storeSwitcher}
        services={showsServices(business)}
      >
        {welcome && <WelcomeSplash firstName={welcome.firstName} businessName={business.name} />}
        <PushRegistrar />
        <BiometricSessionSync />
        <OfflineBanner />
        {!isPlanActive(business.plan) && (
          // Deliberately neutral: no price, link or "how to pay", so it's
          // allowed inside the store apps too. A web-only renew button
          // would go next to it inside <HideInNativeApp>.
          <div role="status" className="shrink-0 bg-surface-2 px-4 py-2 text-center text-[12.5px] font-medium text-ink-muted">
            {PLAN_LAPSED_MESSAGE}
          </div>
        )}
        {archivedSelected && <ArchivedStoreBanner name={archivedSelected.name} />}
        {business.stores.length === 0 && business.role !== "owner" && <NoStoreYet />}
        {children}
      </AppShell>
    </NativeAppProvider>
  );
}

// A Gerente or Agente who isn't in any Tienda yet (or whose Tiendas were
// all archived) sees no conversations until a Dueño adds them to one.
function NoStoreYet() {
  return (
    <div role="status" className="shrink-0 bg-surface-2 px-4 py-2 text-center text-[12.5px] font-medium text-ink-muted">
      Todavía no tienes conversaciones asignadas. Pídele al dueño de tu negocio que te agregue en Equipo.
    </div>
  );
}
