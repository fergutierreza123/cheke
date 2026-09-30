"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: ChatIcon },
  { href: "/chekeo", label: "Chekeo", icon: KanbanIcon },
  { href: "/contacts", label: "Contactos", icon: UsersIcon },
  { href: "/comments", label: "Comentarios", icon: CommentIcon },
  { href: "/templates", label: "Plantillas", icon: TemplateIcon },
  { href: "/inventory", label: "Inventario", icon: BoxIcon },
  { href: "/team", label: "Equipo", icon: TargetIcon },
  { href: "/notifications", label: "Notificaciones", icon: BellIcon },
  { href: "/analytics", label: "Analítica", icon: ChartIcon },
];

export function Sidebar({
  businessName,
  businessCity = "Honduras",
  notificationCount = 0,
}: {
  businessName: string;
  businessCity?: string;
  notificationCount?: number;
}) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex h-full w-60 min-w-60 flex-col bg-brand-dark py-6">
      <div className="px-6 pb-[22px] pt-1">
        <Image src="/logos/cheke-wordmark-color.png" alt="Cheke" width={148} height={80} priority />
      </div>

      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        const badge = href === "/notifications" ? notificationCount : 0;
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex items-center gap-3 px-6 py-[11px] text-[14.5px] transition-colors ${
              active ? "font-semibold text-white" : "text-[#A9B1CC] hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {/* Shared-layout pill: animates from the previous active item to
                this one instead of just appearing here (spatial consistency —
                the highlight travels, it doesn't teleport). */}
            {active && (
              <motion.div
                layoutId="nav-active-pill"
                className="absolute inset-0 border-l-[3px] border-accent bg-white/[0.06]"
                transition={
                  prefersReducedMotion
                    ? { duration: 0.01 }
                    : { type: "spring", bounce: 0, duration: 0.4 }
                }
              />
            )}
            <Icon className="relative z-10 h-[18px] w-[18px] shrink-0" />
            <span className="relative z-10 flex-1">{label}</span>
            {badge > 0 && (
              <span className="relative z-10 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </Link>
        );
      })}

      <div className="mt-auto flex items-center gap-2.5 border-t border-white/[0.08] px-6 pt-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand p-1.5 ring-2 ring-white/15">
          <Image src="/logos/cheke-icon.png" alt="" width={20} height={20} />
        </div>
        <div>
          <div className="text-[13.5px] font-semibold text-white">{businessName}</div>
          <div className="text-xs text-[#9AA3C4]">{businessCity}</div>
        </div>
      </div>
    </div>
  );
}

function iconProps(className?: string) {
  return {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.5-.3-3.6-.8L3 21l1.8-5.4A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}
function KanbanIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="4" width="4" height="16" />
      <rect x="10" y="4" width="4" height="10" />
      <rect x="17" y="4" width="4" height="7" />
    </svg>
  );
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function CommentIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}
function BoxIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.79 0l-8-4a2 2 0 0 1-1.1-1.8V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0z" />
      <path d="M2.32 6.16L12 11l9.68-4.84" />
      <path d="M12 22.76V11" />
    </svg>
  );
}
function TargetIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}
function BellIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function ChartIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4 19V10" />
      <path d="M12 19V5" />
      <path d="M20 19v-7" />
    </svg>
  );
}
