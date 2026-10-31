import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import type { UserInfo } from "@/lib/user";
import type { StoreSwitcherProps } from "@/components/StoreSwitcher";

// One shell for every signed-in screen: side menu on desktop (lg+), bottom
// tab bar on phones. h-dvh (not h-screen) so iOS Safari's collapsing
// toolbar doesn't push the tab bar off the bottom of the screen.
export function AppShell({
  businessName,
  notificationCount,
  basePath,
  user,
  storeSwitcher = null,
  services = false,
  children,
}: {
  businessName: string;
  notificationCount: number;
  basePath?: string;
  user: UserInfo;
  // Only for people in 2+ Tiendas; null keeps the shell exactly as before.
  storeSwitcher?: StoreSwitcherProps | null;
  // The Tiendas on screen give services: «Servicios» instead of «Catálogo».
  services?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-bg lg:flex-row">
      {/* Keeps headers clear of the iPhone notch/status bar in the installed
          app. 0px in a normal browser, so nothing changes there. */}
      <div className="shrink-0 bg-surface lg:hidden" style={{ height: "env(safe-area-inset-top)" }} />
      <div className="hidden h-full lg:block">
        <Sidebar businessName={businessName} notificationCount={notificationCount} user={user} storeSwitcher={storeSwitcher} services={services} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      <MobileNav
        businessName={businessName}
        notificationCount={notificationCount}
        basePath={basePath}
        user={user}
        storeSwitcher={storeSwitcher}
        services={services}
      />
    </div>
  );
}
