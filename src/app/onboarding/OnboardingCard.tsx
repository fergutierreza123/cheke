"use client";

import { motion, useReducedMotion } from "motion/react";

export function OnboardingCard({
  title,
  action,
  children,
}: {
  title: string;
  action: (formData: FormData) => void;
  children: React.ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }
      }
      className="mt-4 rounded-2xl border border-border bg-surface p-6 shadow-sm"
    >
      <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
      <form action={action} className="mt-3 flex flex-col gap-3">
        {children}
      </form>
    </motion.div>
  );
}
