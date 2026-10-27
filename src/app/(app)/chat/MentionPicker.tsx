"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { insertMention, mentionQuery } from "@/lib/conversationNotes";

type Person = { userId: string; name: string };

// "@" in a Nota para el equipo: the Tienda's people, filtered as you type.
// Same keys as the Respuestas rápidas list (arrows, Enter / Tab, Esc).
export function useMentionPicker({
  people,
  draft,
  setDraft,
  inputRef,
  disabled = false,
}: {
  people: Person[];
  draft: string;
  setDraft: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
}): { onKeyDown: (e: React.KeyboardEvent) => boolean; picker: ReactNode } {
  const prefersReducedMotion = useReducedMotion();
  const [active, setActive] = useState({ query: "", index: 0 });
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  const query = disabled ? null : mentionQuery(draft);
  const q = query?.toLowerCase() ?? "";
  const items = query === null || dismissedAt === draft ? [] : people.filter((p) => p.name.toLowerCase().includes(q));
  const open = items.length > 0;
  const index = active.query === query ? Math.min(active.index, items.length - 1) : 0;

  function pick(person: Person) {
    const next = insertMention(draft, person.name);
    setDraft(next);
    const el = inputRef.current;
    el?.focus();
    window.setTimeout(() => el?.setSelectionRange(next.length, next.length), 0);
  }

  function onKeyDown(e: React.KeyboardEvent): boolean {
    if (!open) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissedAt(draft);
      return true;
    }
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
          className="absolute inset-x-3 bottom-full z-20 mb-1.5 rounded-[10px] border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,16,55,0.14)] lg:left-6 lg:right-auto lg:w-[320px]"
        >
          <div className="px-2 py-1 text-[11px] text-ink-soft">Mencionar a alguien del equipo</div>
          <div role="listbox" aria-label="Mencionar" className="max-h-60 overflow-y-auto">
            {items.map((p, i) => (
              <button
                key={p.userId}
                type="button"
                role="option"
                aria-selected={i === index}
                // Keep the keyboard open on the phone: the box keeps focus.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive({ query: query ?? "", index: i })}
                onClick={() => pick(p)}
                className={`block min-h-11 w-full truncate rounded-[7px] px-2 py-1.5 text-left text-[13px] font-semibold text-brand-dark ${
                  i === index ? "bg-surface-2" : "hover:bg-surface-2"
                }`}
              >
                @{p.name}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { onKeyDown, picker };
}
