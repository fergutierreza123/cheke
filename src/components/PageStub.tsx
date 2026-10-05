"use client";

import { motion, useReducedMotion } from "motion/react";

export function PageStub({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle: string;
  phase: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3.5 lg:h-[72px] lg:px-8 lg:py-0">
        <div>
          <div className="text-display font-heading text-xl font-semibold text-ink">{title}</div>
          <div className="text-sm text-ink-muted">{subtitle}</div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 lg:px-8">
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }
          }
          className="w-full max-w-sm rounded-2xl border border-dashed border-border bg-surface p-6 text-center lg:w-auto lg:p-8"
        >
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint text-brand-dark">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12 8v5" />
              <path d="M12 16h.01" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">Todavía no está conectado a datos reales.</p>
          <p className="mt-1 text-xs text-ink-soft">Esta pantalla se construye en: {phase}</p>
        </motion.div>
      </div>
    </div>
  );
}
