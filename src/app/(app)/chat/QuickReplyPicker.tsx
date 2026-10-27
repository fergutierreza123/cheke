"use client";

import { useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  fillQuickReply,
  filterQuickReplies,
  insertQuickReply,
  slashQuery,
  type QuickReply,
} from "@/lib/quickReplies";

// Respuestas rápidas in the Chat composer (issue #52): typing "/" opens a
// list above the box that filters as you type (/hor → /horario). Arrow keys
// + Enter or Tab pick one, Esc closes it, and a tap works the same on the
// phone. The reply replaces the "/word", with {nombre} filled in, ready to
// edit or send.
export function useQuickReplyPicker({
  replies,
  draft,
  setDraft,
  contactName,
  inputRef,
  disabled = false,
  canManage = false,
}: {
  replies: QuickReply[];
  draft: string;
  setDraft: (text: string) => void;
  contactName: string | null | undefined;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  canManage?: boolean;
}): { onKeyDown: (e: React.KeyboardEvent) => boolean; picker: ReactNode } {
  const prefersReducedMotion = useReducedMotion();
  // Highlighted row, remembered per query so typing resets it to the top.
  const [active, setActive] = useState({ query: "", index: 0 });
  // Esc hides the list until the text changes.
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  const query = disabled ? null : slashQuery(draft);
  const open = query !== null && dismissedAt !== draft;
  const items = open ? filterQuickReplies(replies, query).slice(0, 50) : [];
  const index = active.query === query ? Math.min(active.index, Math.max(items.length - 1, 0)) : 0;

  function pick(reply: QuickReply) {
    const next = insertQuickReply(draft, fillQuickReply(reply.body, contactName));
    setDraft(next);
    const el = inputRef.current;
    el?.focus();
    // After React has put the new text in the box: caret at the end.
    window.setTimeout(() => el?.setSelectionRange(next.length, next.length), 0);
  }

  function onKeyDown(e: React.KeyboardEvent): boolean {
    if (!open) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissedAt(draft);
      return true;
    }
    if (items.length === 0) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive({ query: query ?? "", index: (index + step + items.length) % items.length });
      return true;
    }
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
      e.preventDefault();
      pick(items[index]);
      return true;
    }
    return false;
  }

  const picker = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ type: "spring", bounce: 0, duration: 0.25 }}
          className="absolute inset-x-3 bottom-full z-20 mb-1.5 rounded-[10px] border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,16,55,0.14)] lg:left-6 lg:right-auto lg:w-[380px]"
        >
          <div className="flex items-center justify-between px-2 py-1 text-[11px] text-ink-soft">
            <span>Respuestas rápidas</span>
            <Link href="/templates/respuestas" className="font-semibold text-brand">
              {canManage ? "Administrar" : "Ver todas"}
            </Link>
          </div>
          <div role="listbox" aria-label="Respuestas rápidas" className="max-h-60 overflow-y-auto">
            {items.length === 0 && (
              <div className="px-2 py-2 text-[12.5px] text-ink-soft">
                {replies.length === 0
                  ? canManage
                    ? "Todavía no hay respuestas rápidas. Toca Administrar para crear la primera."
                    : "Todavía no hay respuestas rápidas. Pídele al dueño o a un gerente que las agregue."
                  : `Ninguna respuesta con /${query}.`}
              </div>
            )}
            {items.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={i === index}
                // Keep the keyboard open on the phone: the box keeps focus.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive({ query: query ?? "", index: i })}
                onClick={() => pick(r)}
                className={`block min-h-11 w-full rounded-[7px] px-2 py-1.5 text-left ${
                  i === index ? "bg-surface-2" : "hover:bg-surface-2"
                }`}
              >
                <div className="truncate text-[12.5px] font-semibold text-brand">/{r.shortcut}</div>
                <div className="truncate text-[12px] text-ink-soft">{fillQuickReply(r.body, contactName)}</div>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { onKeyDown, picker };
}
