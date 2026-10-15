"use client";

import { useActionState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { reviewerSignIn, type ReviewerLoginState } from "./actions";

const INPUT =
  "rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint";

export function ReviewerLoginForm() {
  const [state, action, pending] = useActionState<ReviewerLoginState, FormData>(reviewerSignIn, {});
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.form
      action={action}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.4 }}
      className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_60px_rgba(0,16,55,0.25)]"
    >
      <label htmlFor="reviewer-email" className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        Correo electrónico
      </label>
      <input id="reviewer-email" name="email" type="email" required autoComplete="username" className={INPUT} />
      <label htmlFor="reviewer-password" className="mt-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
        Contraseña
      </label>
      <input
        id="reviewer-password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className={INPUT}
      />
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </motion.form>
  );
}
