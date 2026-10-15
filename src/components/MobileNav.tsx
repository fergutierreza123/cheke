"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DEFAULT_NAV_ITEMS } from "./Sidebar";
import { initialsFor } from "@/lib/format";
import { signOut } from "@/app/(app)/account/actions";
import type { UserInfo } from "@/lib/user";
import { StoreSwitcher, type StoreSwitcherProps } from "@/components/StoreSwitcher";

// Phones get a bottom tab bar (thumb-reachable) instead of the desktop side
// menu: the four screens used all day, plus "Más" for the rest.
const PRIMARY = ["/chat", "/chekeo", "/contacts", "/inventory"];

export function MobileNav({
  businessName,
  notificationCount = 0,
  basePath = "",
  user,
  storeSwitcher = null,
}: {
  businessName: string;
  notificationCount?: number;
  // Prefix for every link; only the /demo showcase uses it, so its tab bar
  // navigates between demo screens instead of the real (signed-in) routes.
  basePath?: string;
  user: UserInfo;
  storeSwitcher?: StoreSwitcherProps | null;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const primary = PRIMARY.map((href) => DEFAULT_NAV_ITEMS.find((i) => i.href === href)!);
  const more = DEFAULT_NAV_ITEMS.filter((i) => !PRIMARY.includes(i.href));
  const moreActive = more.some((i) => pathname.startsWith(basePath + i.href)) || pathname.startsWith(basePath + "/account");
  const isDemo = basePath !== "";

  return (
    <>
      <nav
        className="flex shrink-0 items-stretch border-t border-white/[0.08] bg-brand-dark lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primary.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(basePath + href);
          return (
            <Link
              key={href}
              href={basePath + href}
              onClick={() => setMoreOpen(false)}
              className={`flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[10.5px] ${
                active ? "font-semibold text-white" : "text-[#A9B1CC]"
              }`}
            >
              <Icon className={`h-[22px] w-[22px] ${active ? "text-accent" : ""}`} />
              {label}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={`relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[10.5px] ${
            moreActive || moreOpen ? "font-semibold text-white" : "text-[#A9B1CC]"
          }`}
        >
          <MoreIcon className={`h-[22px] w-[22px] ${moreActive || moreOpen ? "text-accent" : ""}`} />
          Más
          {notificationCount > 0 && (
            <span className="absolute right-[calc(50%-20px)] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-bold text-white">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { y: "100%" }}
              animate={prefersReducedMotion ? { opacity: 1 } : { y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { y: "100%" }}
              transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] bg-brand-dark px-2 pt-3 lg:hidden"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
            >
              <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/20" />
              {storeSwitcher && <StoreSwitcher {...storeSwitcher} variant="sheet" onNavigate={() => setMoreOpen(false)} />}
              {/* Who's signed in → Mi cuenta (details, log out) */}
              <Link
                href={basePath + "/account"}
                onClick={() => setMoreOpen(false)}
                className="mb-1 flex items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white ring-2 ring-white/15">
                  {initialsFor(user.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-white">{user.name}</div>
                  <div className="truncate text-xs text-[#9AA3C4]">{businessName}</div>
                </div>
                <span aria-hidden className="text-lg text-[#9AA3C4]">›</span>
              </Link>
              {more.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(basePath + href);
                const badge = href === "/notifications" ? notificationCount : 0;
                return (
                  <Link
                    key={href}
                    href={basePath + href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3.5 rounded-xl px-4 py-3.5 text-[15px] ${
                      active ? "bg-white/[0.08] font-semibold text-white" : "text-[#C5CBE0]"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1">{label}</span>
                    {badge > 0 && (
                      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
              {isDemo ? (
                <Link href="/demo" className="flex items-center gap-3.5 rounded-xl px-4 py-3.5 text-[15px] text-[#FF9C9C]">
                  <LogoutIcon className="h-5 w-5 shrink-0" />
                  Cerrar sesión
                </Link>
              ) : (
                <form action={signOut}>
                  <button type="submit" className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left text-[15px] text-[#FF9C9C]">
                    <LogoutIcon className="h-5 w-5 shrink-0" />
                    Cerrar sesión
                  </button>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
