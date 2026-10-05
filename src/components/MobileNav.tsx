"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DEFAULT_NAV_ITEMS } from "./Sidebar";

// Phones get a bottom tab bar (thumb-reachable) instead of the desktop side
// menu: the four screens used all day, plus "Más" for the rest.
const PRIMARY = ["/chat", "/chekeo", "/contacts", "/inventory"];

export function MobileNav({
  businessName,
  notificationCount = 0,
  basePath = "",
}: {
  businessName: string;
  notificationCount?: number;
  // Prefix for every link; only the /demo showcase uses it, so its tab bar
  // navigates between demo screens instead of the real (signed-in) routes.
  basePath?: string;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const primary = PRIMARY.map((href) => DEFAULT_NAV_ITEMS.find((i) => i.href === href)!);
  const more = DEFAULT_NAV_ITEMS.filter((i) => !PRIMARY.includes(i.href));
  const moreActive = more.some((i) => pathname.startsWith(basePath + i.href));

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
              <div className="px-4 pb-2 pt-1 text-xs text-[#9AA3C4]">{businessName}</div>
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
