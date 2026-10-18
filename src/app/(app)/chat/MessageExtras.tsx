"use client";

import { useRef, type ReactNode } from "react";
import { motion, AnimatePresence, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { DELETED_TEXT, INSTAGRAM_REACTION, QUICK_REACTIONS } from "@/lib/messageEvents";
import type { ChannelType, Message } from "@/lib/types";

// The WhatsApp-like extras of a Chat bubble (issue #51): the quoted message
// a reply carries, the reaction emojis under it, "Mensaje eliminado", the
// "Responder / reaccionar" menu and swipe-to-reply on phones.

// Which emojis the business may react with on this network: WhatsApp any,
// Instagram only a heart, Messenger none. Conversations without a channel
// (demo) only save in cheke, so they get WhatsApp's set.
export function reactionChoices(type: ChannelType | null | undefined): readonly string[] {
  if (type === "instagram") return [INSTAGRAM_REACTION];
  if (type === "facebook") return [];
  return QUICK_REACTIONS;
}

// One line of text for a quoted message.
export function quoteText(m: Message): string {
  if (m.deleted_at) return DELETED_TEXT;
  const text = m.media_info?.caption || m.body || "";
  return text.replace(/\s+/g, " ").trim() || "Mensaje";
}

// Who wrote it, like WhatsApp: "Tú" for the business, the customer's name.
function author(m: Message, contactName: string): string {
  return m.direction === "out" ? "Tú" : contactName;
}

// The quoted message at the top of a reply bubble. Tapping it jumps to the
// original. `quoted` missing = not in cheke (older than the history).
export function QuotedMessage({
  quoted,
  contactName,
  onJump,
}: {
  quoted: Message | undefined;
  contactName: string;
  onJump: (id: string) => void;
}) {
  const out = quoted?.direction === "out";
  return (
    <button
      type="button"
      onClick={() => quoted && onJump(quoted.id)}
      disabled={!quoted}
      className={`-mx-[3px] mb-1 flex w-[calc(100%+6px)] min-w-[160px] overflow-hidden rounded-[6px] bg-black/[0.05] text-left ${
        quoted ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <span className={`w-1 shrink-0 ${out ? "bg-[#06CF9C]" : "bg-[#53BDEB]"}`} />
      <span className="min-w-0 flex-1 px-2 py-1">
        <span className={`block truncate text-[12.5px] font-semibold ${out ? "text-[#06A37C]" : "text-[#1F8FC6]"}`}>
          {quoted ? author(quoted, contactName) : "Mensaje"}
        </span>
        <span className="line-clamp-2 text-[13px] leading-[17px] text-[#667781]">
          {quoted ? quoteText(quoted) : "Mensaje no disponible"}
        </span>
      </span>
    </button>
  );
}

// "Respondiendo a…" above the composer, with an X to cancel.
export function ReplyBar({ message, contactName, onCancel }: { message: Message; contactName: string; onCancel: () => void }) {
  const reduced = useReducedMotion();
  const out = message.direction === "out";
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
      className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-3 pt-2 lg:px-6"
    >
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-lg bg-surface-2">
        <span className={`w-1 shrink-0 ${out ? "bg-[#06CF9C]" : "bg-[#53BDEB]"}`} />
        <div className="min-w-0 flex-1 px-2.5 py-1.5">
          <div className={`truncate text-[12px] font-semibold ${out ? "text-[#06A37C]" : "text-[#1F8FC6]"}`}>
            Respondiendo a {out ? "tu mensaje" : contactName}
          </div>
          <div className="truncate text-[12.5px] text-ink-muted">{quoteText(message)}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar respuesta"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}

// "🚫 Mensaje eliminado", in place of the text.
export function DeletedBody() {
  return (
    <span className="inline-flex items-center gap-1.5 italic text-[#667781]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="m5.6 5.6 12.8 12.8" />
      </svg>
      {DELETED_TEXT}
    </span>
  );
}

// The customer's and the business's emojis, overlapping the bubble's bottom
// edge like WhatsApp. Tapping the business's own takes it back.
export function ReactionChips({ message, onRemoveOwn }: { message: Message; onRemoveOwn?: () => void }) {
  const reduced = useReducedMotion();
  const out = message.direction === "out";
  const items = [
    message.reaction_in ? { key: "in", emoji: message.reaction_in, label: "Reacción del cliente" } : null,
    message.reaction_out ? { key: "out", emoji: message.reaction_out, label: "Tu reacción (toca para quitarla)" } : null,
  ].filter((x) => x !== null);
  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
          className={`absolute -bottom-[18px] z-[1] flex items-center gap-0.5 rounded-full border border-[#EFEAE2] bg-white px-1.5 py-[1px] text-[14px] leading-[20px] shadow-[0_1px_2px_rgba(11,20,26,0.15)] ${
            out ? "right-2" : "left-2"
          }`}
        >
          {items.map((r) =>
            r.key === "out" && onRemoveOwn ? (
              <button key={r.key} type="button" onClick={onRemoveOwn} title={r.label} aria-label={r.label}>
                {r.emoji}
              </button>
            ) : (
              <span key={r.key} title={r.label} aria-label={r.label}>
                {r.emoji}
              </span>
            ),
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// The small menu over a bubble: a row of emojis (when this network allows
// reacting) and "Responder".
export function MessageMenu({
  open,
  out,
  below = false,
  emojis,
  current,
  canReply,
  onReply,
  onCopy = null,
  onReact,
  onClose,
}: {
  open: boolean;
  out: boolean;
  // Opens under the bubble (the first messages, near the top edge).
  below?: boolean;
  emojis: readonly string[];
  current: string | null | undefined;
  canReply: boolean;
  onReply: () => void;
  // "Copiar" (null = nothing worth copying in this message).
  onCopy?: (() => void) | null;
  onReact: (emoji: string) => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
          <motion.div
            role="menu"
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
            transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
            className={`absolute ${below ? "top-full mt-1.5" : "bottom-full mb-1.5"} z-30 flex flex-col overflow-hidden rounded-[12px] border border-border bg-surface shadow-[0_8px_24px_rgba(0,16,55,0.16)] ${
              out ? "right-0" : "left-0"
            }`}
            style={{ fontFamily: "inherit" }}
          >
            {emojis.length > 0 && (
              <div className="flex items-center gap-0.5 px-1.5 py-1.5">
                {emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="menuitem"
                    onClick={() => onReact(e)}
                    aria-label={current === e ? `Quitar ${e}` : `Reaccionar con ${e}`}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-[21px] transition-transform active:scale-90 ${
                      current === e ? "bg-brand-tint" : "hover:bg-surface-2"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {canReply && (
              <button
                type="button"
                role="menuitem"
                onClick={onReply}
                className={`flex min-h-10 items-center gap-2.5 px-3.5 text-left text-[13.5px] text-ink hover:bg-surface-2 ${
                  emojis.length > 0 ? "border-t border-border" : ""
                }`}
              >
                <ReplyIcon className="h-4 w-4 text-ink-muted" />
                Responder
              </button>
            )}
            {onCopy && (
              <button
                type="button"
                role="menuitem"
                onClick={onCopy}
                className={`flex min-h-10 items-center gap-2.5 px-3.5 text-left text-[13.5px] text-ink hover:bg-surface-2 ${
                  emojis.length > 0 || canReply ? "border-t border-border" : ""
                }`}
              >
                <CopyIcon className="h-4 w-4 text-ink-muted" />
                Copiar
              </button>
            )}
          </motion.div>
      )}
    </AnimatePresence>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export function ReplyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

// Phones: drag a bubble to the right to answer it (like WhatsApp), or hold
// it to open the menu. The bubble springs back on release — with a little
// bounce, since the finger gave it momentum. Off for reduced motion (the
// menu still works) and on mouse screens (the hover button does it there).
const SWIPE_TRIGGER_PX = 56;
const LONG_PRESS_MS = 450;

export function SwipeToReply({
  enabled,
  swipe = enabled,
  onReply,
  onLongPress,
  className = "",
  children,
}: {
  // Hold to open the menu.
  enabled: boolean;
  // Drag right to answer (off when nothing can be sent; holding still works).
  swipe?: boolean;
  onReply: () => void;
  onLongPress: () => void;
  className?: string;
  children: ReactNode;
}) {
  const x = useMotionValue(0);
  const arrowOpacity = useTransform(x, [8, SWIPE_TRIGGER_PX], [0, 1]);
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <motion.div
      drag={enabled && swipe && !reduced ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.5 }}
      dragSnapToOrigin
      dragTransition={{ bounceStiffness: 500, bounceDamping: 28 }}
      onDragStart={cancel}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_TRIGGER_PX) onReply();
      }}
      onPointerDown={(e) => {
        if (!enabled || e.pointerType === "mouse") return;
        start.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      style={{ x }}
      className={`relative ${className}`}
    >
      {enabled && swipe && (
        <motion.span
          aria-hidden
          style={{ opacity: arrowOpacity }}
          className="pointer-events-none absolute -left-9 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#667781] shadow-sm"
        >
          <ReplyIcon className="h-4 w-4" />
        </motion.span>
      )}
      {children}
    </motion.div>
  );
}
