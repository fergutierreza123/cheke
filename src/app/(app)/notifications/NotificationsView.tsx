"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { relativeTime } from "@/lib/format";
import type { NotificationItem, NotificationKind } from "@/lib/notifications";

const KIND_STYLE: Record<NotificationKind, { bg: string; color: string }> = {
  message: { bg: "var(--color-brand-tint)", color: "var(--color-brand-dark)" },
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
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-8 py-[18px]">
        <div className="flex items-center gap-2.5">
          <h1 className="font-heading text-xl font-semibold text-ink">Notificaciones</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-danger px-2.5 py-0.5 text-[11px] font-bold text-white">
              {unreadCount} nueva{unreadCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {(["todas", "no-leidas"] as const).map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg border px-3 py-[7px] text-[12.5px] font-semibold transition-colors ${
                  active ? "border-brand-dark bg-brand-dark text-white" : "border-border bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                {f === "todas" ? "Todas" : "No leídas"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
        <div className="flex max-w-[640px] flex-col gap-1.5">
          {filtered.map((n) => {
            const style = KIND_STYLE[n.kind];
            const unread = !readIds.has(n.id);
            return (
              <Link
                key={n.id}
                href={n.link}
                onClick={() => markRead(n.id)}
                className={`flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 transition-colors ${
                  unread ? "bg-brand-tint hover:bg-brand-tint/70" : "bg-surface hover:bg-surface-2"
                }`}
              >
                <div
                  style={{ background: style.bg, color: style.color }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                >
                  {n.kind === "message" && <MessageIcon className="h-4 w-4" />}
                  {n.kind === "warning" && <WarningIcon className="h-4 w-4" />}
                  {n.kind === "success" && <CheckIcon className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate text-[12.5px] font-semibold text-ink">{n.title}</div>
                    <div className="shrink-0 text-[11px] text-ink-soft">{relativeTime(n.time)}</div>
                  </div>
                  <div className="truncate text-[12px] text-ink-muted">{n.description}</div>
                </div>
                {unread && <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-16 text-center text-[13px] text-ink-soft">
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
