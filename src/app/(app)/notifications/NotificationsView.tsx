"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { relativeTime } from "@/lib/format";
import type { NotificationItem, NotificationKind } from "@/lib/notifications";

const KIND_STYLE: Record<NotificationKind, { bg: string; color: string }> = {
  message: { bg: "var(--color-accent-tint)", color: "var(--color-brand-dark)" },
  warning: { bg: "var(--color-danger-tint)", color: "var(--color-danger)" },
  success: { bg: "var(--color-accent-tint)", color: "var(--color-brand-dark)" },
};

export function NotificationsView({ notifications }: { notifications: NotificationItem[] }) {
  // No persisted read-state (no notifications table) — this resets on
  // reload, but everything shown is computed from real data, nothing
  // fabricated to fill the screen.
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"todas" | "no-leidas">("todas");

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;
  const filtered = useMemo(
    () => (filter === "no-leidas" ? notifications.filter((n) => !readIds.has(n.id)) : notifications),
    [notifications, filter, readIds],
  );

  function markRead(id: string) {
    setReadIds((prev) => new Set(prev).add(id));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col items-stretch gap-3 border-b border-border bg-surface px-4 py-3.5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:px-8 lg:py-[18px]">
        <div className="flex items-center gap-2.5">
          <h1 className="font-heading text-xl font-semibold text-ink">Notificaciones</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-danger px-2.5 py-0.5 text-[11px] font-bold text-white">
              {unreadCount} nueva{unreadCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5 lg:flex">
          {(["todas", "no-leidas"] as const).map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-10 rounded-lg border px-3 py-[7px] text-[13.5px] font-semibold transition-colors lg:min-h-0 lg:text-[12.5px] ${
                  active ? "border-brand-dark bg-brand-dark text-white" : "border-border bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                {f === "todas" ? "Todas" : "No leídas"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Flat, full-width feed (like a social app's notification list) —
          no per-row card chrome or gaps eating space, just a continuous
          divided list with a hairline between rows. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="divide-y divide-border">
          {filtered.map((n) => {
            const style = KIND_STYLE[n.kind];
            const unread = !readIds.has(n.id);
            return (
              <Link
                key={n.id}
                href={n.link}
                onClick={() => markRead(n.id)}
                className={`flex min-h-16 items-center gap-3 px-4 py-3 transition-colors lg:min-h-0 lg:px-6 lg:py-2.5 ${
                  unread ? "bg-brand-tint hover:bg-brand-tint/70" : "hover:bg-surface-2"
                }`}
              >
                <div
                  style={{ background: style.bg, color: style.color }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full lg:h-7 lg:w-7"
                >
                  {n.kind === "message" && <MessageIcon className="h-4 w-4 lg:h-3.5 lg:w-3.5" />}
                  {n.kind === "warning" && <WarningIcon className="h-4 w-4 lg:h-3.5 lg:w-3.5" />}
                  {n.kind === "success" && <CheckIcon className="h-4 w-4 lg:h-3.5 lg:w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-[14px] font-semibold text-ink lg:text-[12.5px]">{n.title}</span>
                    <span className="shrink-0 text-[12px] text-ink-soft lg:text-[11px]">· {relativeTime(n.time)}</span>
                  </div>
                  <div className="truncate text-[13px] text-ink-muted lg:text-[12px]">{n.description}</div>
                </div>
                {unread && <div className="h-2 w-2 shrink-0 rounded-full bg-brand lg:h-1.5 lg:w-1.5" />}
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-16 text-center text-[13px] text-ink-soft">
              Ya estás al día — no hay notificaciones sin leer.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.5-.3-3.6-.8L3 21l1.8-5.4A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}
function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
