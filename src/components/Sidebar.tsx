"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, Reorder, useDragControls, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

export const DEFAULT_NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: ChatIcon },
  { href: "/chekeo", label: "Chekeo", icon: KanbanIcon },
  { href: "/contacts", label: "Contactos", icon: UsersIcon },
  { href: "/comments", label: "Comentarios", icon: CommentIcon },
  { href: "/templates", label: "Plantillas", icon: TemplateIcon },
  { href: "/inventory", label: "Catálogo", icon: BoxIcon },
  { href: "/channels", label: "Canales", icon: PlugIcon },
  { href: "/team", label: "Equipo", icon: TargetIcon },
  { href: "/notifications", label: "Notificaciones", icon: BellIcon },
  { href: "/analytics", label: "Analítica", icon: ChartIcon },
];
const DEFAULT_ORDER = DEFAULT_NAV_ITEMS.map((i) => i.href);
const NAV_ORDER_KEY = "cheke-nav-order";

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
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);

  // Restore the order this viewer left it in last time — per-browser only,
  // same pattern as Chat's resizable list width. Read after mount (not a
  // lazy initial state) so server-rendered markup matches the first client
  // render with no hydration diff.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(NAV_ORDER_KEY) ?? "null") as string[] | null;
      if (!saved) return;
      // Stay forward-compatible with nav items added/removed later: keep
      // the saved positions for hrefs that still exist, then append any
      // current item that wasn't in the saved list.
      const restored = saved.filter((href) => DEFAULT_ORDER.includes(href));
      const missing = DEFAULT_ORDER.filter((href) => !restored.includes(href));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external store (localStorage) on mount
      setOrder([...restored, ...missing]);
    } catch {
      // ignore — private browsing, blocked storage, etc.
    }
  }, []);

  function handleReorder(next: string[]) {
    setOrder(next);
    try {
      localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  const items = order
    .map((href) => DEFAULT_NAV_ITEMS.find((i) => i.href === href))
    .filter((i): i is (typeof DEFAULT_NAV_ITEMS)[number] => Boolean(i));

  return (
    <div className="flex h-full w-60 min-w-60 flex-col bg-brand-dark py-6">
      <div className="px-6 pb-[22px] pt-1">
        <Image src="/logos/cheke-wordmark-color.png" alt="Cheke" width={148} height={80} priority />
      </div>

      <Reorder.Group axis="y" values={order} onReorder={handleReorder} as="div" className="flex flex-col">
        {items.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            active={pathname.startsWith(item.href)}
            badge={item.href === "/notifications" ? notificationCount : 0}
            reducedMotion={!!prefersReducedMotion}
          />
        ))}
      </Reorder.Group>

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

// Dragging starts only from the grip (dragListener off + manual controls),
// so clicking the label still just navigates. The grip is a sibling of the
// Link, not inside it, so letting go of a drag can't register as a click on
// the link and navigate away.
function NavRow({
  item,
  active,
  badge,
  reducedMotion,
}: {
  item: (typeof DEFAULT_NAV_ITEMS)[number];
  active: boolean;
  badge: number;
  reducedMotion: boolean;
}) {
  const controls = useDragControls();
  const { href, label, icon: Icon } = item;
  return (
    <Reorder.Item
      as="div"
      value={href}
      dragListener={false}
      dragControls={controls}
      whileDrag={reducedMotion ? undefined : { scale: 1.03, backgroundColor: "#0D1B4B", zIndex: 10 }}
      transition={reducedMotion ? { duration: 0.01 } : { type: "spring", bounce: 0, duration: 0.35 }}
      className={`relative flex items-stretch text-[14.5px] ${
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
            reducedMotion ? { duration: 0.01 } : { type: "spring", bounce: 0, duration: 0.4 }
          }
        />
      )}
      <Link href={href} className="relative z-10 flex flex-1 items-center gap-3 py-[11px] pl-6">
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1">{label}</span>
        {badge > 0 && (
          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </Link>
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          controls.start(e);
        }}
        title="Arrastra para reordenar"
        aria-label={`Reordenar ${label}`}
        style={{ touchAction: "none" }}
        className="relative z-10 flex w-10 shrink-0 cursor-grab items-center justify-center text-white/25 hover:text-white/60 active:cursor-grabbing"
      >
        <GripIcon className="h-3.5 w-3.5" />
      </div>
    </Reorder.Item>
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
function PlugIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9 2v6" />
      <path d="M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 17v5" />
    </svg>
  );
}
function GripIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  );
}
