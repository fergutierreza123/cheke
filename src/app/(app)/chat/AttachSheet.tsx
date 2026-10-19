"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

// WhatsApp's "+" menu for phones and tablets: everything that can go into a
// chat besides text, in one sheet that rises from the bottom, so the
// composer keeps only "+", the message box, the camera and the mic.
// Computers keep the inline buttons from design/Inbox.html instead.
//
// Motion (CLAUDE.md "Interaction & motion"): a critically damped spring up
// from the bottom and back down the same path; drag it down to close (the
// close starts from where the finger left it); the items arrive in a short
// cascade (<200 ms). Reduced motion: a plain cross-fade.

export type AttachOption = {
  key: string;
  label: string;
  icon: ReactNode;
  // Icon circle color (WhatsApp gives each option its own).
  tint: string;
  onSelect: () => void;
  disabled?: boolean;
};

export function AttachSheet({
  open,
  options,
  onClose,
  footnote,
}: {
  open: boolean;
  options: AttachOption[];
  onClose: () => void;
  footnote?: string | null;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const spring = { type: "spring" as const, bounce: 0, duration: 0.35 };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[#001037]/30 backdrop-blur-[2px]"
            aria-hidden="true"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Adjuntar"
            initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            transition={reduceMotion ? { duration: 0.15 } : spring}
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose();
            }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-[18px] border-t border-border bg-surface px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_32px_rgba(0,16,55,0.16)]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
            <div className="mx-auto grid max-w-md grid-cols-4 gap-x-2 gap-y-4">
              {options.map((option, i) => (
                <motion.button
                  key={option.key}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    onClose();
                    option.onSelect();
                  }}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { ...spring, delay: 0.04 + i * 0.025 }}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-1 text-center disabled:opacity-40"
                >
                  <span
                    className="flex h-[54px] w-[54px] items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: option.tint }}
                  >
                    {option.icon}
                  </span>
                  <span className="text-[12px] leading-tight text-ink">{option.label}</span>
                </motion.button>
              ))}
            </div>
            {footnote && <p className="mx-auto mt-4 max-w-md text-center text-[11.5px] leading-snug text-ink-soft">{footnote}</p>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
