"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatMessageTime, relativeTime } from "@/lib/format";
import { NOTE_TAG_LABEL, noteStrip, noteTag, shortSummary, type NoteTag } from "@/lib/conversationNotes";
import type { ConversationNote } from "@/lib/types";

// Team-only notes (Traspaso, Queja, Pago, falta info) as one line above the
// conversation: the newest note's kind, a short summary and when; "Ver más"
// drops the full text (and the older notes behind "+N") over the chat
// instead of pushing it down. Never sent to the customer.
export function NoteStrip({
  notes,
  complaintOpen,
  onResolveComplaint,
}: {
  notes: ConversationNote[];
  complaintOpen: boolean;
  // Gerentes / Dueños: "Resolver" on an open Queja.
  onResolveComplaint?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const strip = noteStrip(notes, { complaintOpen });
  if (!strip) return null;
  const { head, rest } = strip;
  const tag = noteTag(head);
  const short = shortSummary(head.summary);
  const canResolve = complaintOpen && tag === "queja" && Boolean(onResolveComplaint);

  return (
    <div className="relative z-10 shrink-0 border-b border-border bg-surface-2">
      <div className="relative z-10 flex h-10 items-center gap-1.5 pl-3 pr-2 lg:px-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          title="Solo para el equipo: el cliente no ve esta nota"
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[12.5px]"
        >
          <TagIcon tag={tag} />
          <span className={`shrink-0 font-semibold ${tag === "queja" ? "text-danger" : "text-brand-dark"}`}>
            {NOTE_TAG_LABEL[tag]}
          </span>
          <span className="min-w-0 flex-1 truncate text-ink">{short.text}</span>
          <time dateTime={head.created_at} title={formatMessageTime(head.created_at)} className="shrink-0 text-[11.5px] text-ink-muted">
            {shortAgo(head.created_at)}
          </time>
          {rest.length > 0 && (
            <span className="shrink-0 rounded-full bg-surface px-1.5 text-[11px] font-semibold leading-[18px] text-ink-muted ring-1 ring-border">
              +{rest.length}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-0.5 font-semibold text-brand">
            <span className="hidden sm:inline">{open ? "Ver menos" : "Ver más"}</span>
            <span className="sr-only sm:hidden">{open ? "Ver menos" : "Ver más"}</span>
            <motion.svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4"
              animate={{ rotate: open ? 180 : 0 }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          </span>
        </button>
        {canResolve && (
          <button
            type="button"
            onClick={onResolveComplaint}
            className="h-7 shrink-0 rounded-md border border-danger-border bg-surface px-2.5 text-[12px] font-semibold text-danger hover:bg-danger-tint"
          >
            Resolver
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <>
            {/* Any tap outside closes it. */}
            <div className="fixed inset-0 z-0" onClick={() => setOpen(false)} aria-hidden />
            <motion.div
              id={panelId}
              key="notes"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={reduceMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
              className="absolute inset-x-0 top-full z-10 max-h-[min(60vh,420px)] overflow-y-auto border-b border-border bg-surface shadow-[0_8px_24px_-12px_rgba(0,16,55,0.35)]"
            >
              <ul className="divide-y divide-border">
                {[head, ...rest].map((n) => (
                  <NoteItem key={n.id} note={n} />
                ))}
              </ul>
              <p className="px-3 pb-2.5 pt-1 text-[11.5px] text-ink-muted lg:px-6">Solo para el equipo: el cliente no ve estas notas.</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function NoteItem({ note }: { note: ConversationNote }) {
  const tag = noteTag(note);
  return (
    <li className="flex gap-2 px-3 py-2.5 text-[13px] leading-snug lg:px-6">
      <TagIcon tag={tag} className="mt-px" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`font-semibold ${tag === "queja" ? "text-danger" : "text-brand-dark"}`}>{NOTE_TAG_LABEL[tag]}</span>
          <time dateTime={note.created_at} className="text-[11.5px] text-ink-muted">
            {relativeTime(note.created_at)} · {formatMessageTime(note.created_at)}
          </time>
        </div>
        <p className="mt-0.5 max-w-[72ch] text-ink [overflow-wrap:anywhere]">{note.summary}</p>
        {note.reason && <p className="mt-0.5 text-[12px] text-ink-muted">{note.reason}</p>}
      </div>
    </li>
  );
}

// "hace 3 min" → "3 min": the strip has one line to spare.
function shortAgo(iso: string): string {
  return relativeTime(iso).replace(/^hace /, "");
}

const TAG_STYLE: Record<NoteTag, string> = {
  traspaso: "bg-brand-tint text-brand-dark",
  falta_info: "bg-brand-tint text-brand",
  pago: "bg-accent-tint text-brand-dark",
  queja: "bg-danger-tint text-danger",
};

function TagIcon({ tag, className = "" }: { tag: NoteTag; className?: string }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${TAG_STYLE[tag]} ${className}`} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        {tag === "traspaso" && (
          // Two arrows: the chat passed from chekelin to a person.
          <>
            <path d="M4 8h13l-3.5-3.5" />
            <path d="M20 16H7l3.5 3.5" />
          </>
        )}
        {tag === "falta_info" && (
          <>
            <path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5" />
            <path d="M12 18.5h.01" />
          </>
        )}
        {tag === "pago" && (
          <>
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M3 10.5h18" />
          </>
        )}
        {tag === "queja" && (
          <>
            <path d="M12 7.5v5.5" />
            <path d="M12 17h.01" />
          </>
        )}
      </svg>
    </span>
  );
}
