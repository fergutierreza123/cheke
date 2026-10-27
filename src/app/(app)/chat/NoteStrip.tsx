"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatMessageTime, relativeTime } from "@/lib/format";
import { mentionsMe, NOTE_TAG_LABEL, noteAuthor, noteStrip, noteTag, stripLabel, type NoteTag } from "@/lib/conversationNotes";
import type { ConversationNote } from "@/lib/types";

// Team-only notes (Traspaso, Queja, Pago, falta info, a person's Nota) as ONE
// line above the conversation, like WhatsApp Business / Intercom: who wrote
// the newest note and what it says, cut to fit. A tap opens a sheet with every
// note, newest first. Never sent to the customer.
export function NoteStrip({
  notes,
  complaintOpen,
  onResolveComplaint,
  authorNames = {},
  me = null,
}: {
  notes: ConversationNote[];
  // A person's Nota shows who wrote it.
  authorNames?: Record<string, string>;
  complaintOpen: boolean;
  // Gerentes / Dueños: "Resolver" on an open Queja.
  onResolveComplaint?: () => void;
  // The person looking: notes that @mention them get a badge.
  me?: { userId: string; name: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

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
  const all = [head, ...rest];
  const tag = noteTag(head);
  const canResolve = complaintOpen && tag === "queja" && Boolean(onResolveComplaint);
  const mentioned = all.some((n) => mentionsMe(n, me));

  return (
    <div className="shrink-0 border-b border-border bg-surface-2">
      <div className="flex h-9 items-center gap-1.5 pl-3 pr-2 lg:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Notas del equipo (${all.length}). Ver todas`}
          title="Solo para el equipo: el cliente no ve estas notas"
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left text-[12.5px]"
        >
          <TagIcon tag={tag} />
          <span className={`max-w-[60%] shrink-0 truncate font-semibold ${tag === "queja" ? "text-danger" : "text-brand-dark"}`}>
            {/* "Pide descuento… · Quiere…" for a Traspaso; "Ana: …" otherwise. */}
            {stripLabel(head, authorNames)}
            {tag === "traspaso" && head.reason ? " ·" : ":"}
          </span>
          <span className="min-w-0 flex-1 truncate text-ink">{head.summary.replace(/\s+/g, " ")}</span>
          {mentioned && <MentionBadge />}
          {rest.length > 0 && (
            <span className="shrink-0 rounded-full bg-surface px-1.5 text-[11px] font-semibold leading-[18px] text-ink-muted ring-1 ring-border">
              +{rest.length}
            </span>
          )}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0 text-brand" aria-hidden>
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-[#001037]/30 backdrop-blur-[2px]"
              aria-hidden="true"
            />
            <motion.div
              key="sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Notas del equipo"
              initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
              animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
              transition={reduceMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[75vh] max-w-lg flex-col rounded-t-[18px] border-t border-border bg-surface pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(0,16,55,0.16)]"
            >
              <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
                <div>
                  <div className="font-heading text-[15px] font-semibold text-ink">Notas del equipo</div>
                  <div className="text-[11.5px] text-ink-muted">El cliente no las ve.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar notas"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {all.map((n) => (
                  <NoteItem key={n.id} note={n} authorNames={authorNames} mentioned={mentionsMe(n, me)} />
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Above the composer while it writes a Nota para el equipo (like
// "Respondiendo a…"), with an X back to writing to the customer.
export function NoteComposerBar({ onCancel }: { onCancel: () => void }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
      className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-3 pt-2 lg:px-6"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-accent-tint px-2.5 py-1.5 text-[12.5px]">
        <TagIcon tag="nota" />
        <span className="font-semibold text-brand-dark">Nota para el equipo</span>
        <span className="min-w-0 truncate text-ink-muted">· el cliente no la ve</span>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cerrar nota y volver a escribirle al cliente"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}

function NoteItem({
  note,
  authorNames,
  mentioned,
}: {
  note: ConversationNote;
  authorNames: Record<string, string>;
  mentioned: boolean;
}) {
  const tag = noteTag(note);
  return (
    <li className="flex gap-2 px-4 py-2.5 text-[13px] leading-snug">
      <TagIcon tag={tag} className="mt-px" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`font-semibold ${tag === "queja" ? "text-danger" : "text-brand-dark"}`}>{noteLabel(note, authorNames)}</span>
          <time dateTime={note.created_at} title={formatMessageTime(note.created_at)} className="text-[11.5px] text-ink-muted">
            {relativeTime(note.created_at)}
          </time>
          {mentioned && <MentionBadge />}
        </div>
        <p className="mt-0.5 max-w-[72ch] text-ink [overflow-wrap:anywhere]">{note.summary}</p>
        {note.reason && <p className="mt-0.5 text-[12px] text-ink-muted">{note.reason}</p>}
      </div>
    </li>
  );
}

// The sheet: the kind, and who wrote it ("Traspaso · chekelin", "Nota · Ana").
function noteLabel(note: ConversationNote, authorNames: Record<string, string>): string {
  return `${NOTE_TAG_LABEL[noteTag(note)]} · ${noteAuthor(note, authorNames)}`;
}

// "@" on a note that mentions the person looking.
function MentionBadge() {
  return (
    <span title="Te mencionaron" className="shrink-0 rounded-full bg-brand px-1.5 text-[11px] font-bold leading-[18px] text-white">
      @<span className="sr-only"> Te mencionaron</span>
    </span>
  );
}

const TAG_STYLE: Record<NoteTag, string> = {
  traspaso: "bg-brand-tint text-brand-dark",
  falta_info: "bg-brand-tint text-brand",
  pago: "bg-accent-tint text-brand-dark",
  queja: "bg-danger-tint text-danger",
  nota: "bg-accent-tint text-brand-dark",
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
        {tag === "nota" && (
          // A pencil: someone on the team wrote it.
          <>
            <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
            <path d="M13.5 6.5l4 4" />
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
