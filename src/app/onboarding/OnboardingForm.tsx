"use client";

import { useActionState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { FIELD } from "@/components/OtpFields";
import { createBusiness, type OnboardingState } from "./actions";

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createBusiness, {});
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.form
      action={action}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
      className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_60px_rgba(0,16,55,0.25)]"
    >
      <label htmlFor="onboarding-full-name" className="font-heading text-[15px] font-semibold text-ink">
        Tu nombre
      </label>
      <input
        id="onboarding-full-name"
        name="full_name"
        required
        maxLength={60}
        autoComplete="name"
        autoFocus={!defaultName}
        defaultValue={defaultName}
        placeholder="Ej. María López"
        className={FIELD}
      />
      <label htmlFor="onboarding-business" className="mt-2 font-heading text-[15px] font-semibold text-ink">
        Nombre de tu negocio
      </label>
      <input
        id="onboarding-business"
        name="name"
        required
        maxLength={80}
        autoComplete="organization"
        autoFocus={Boolean(defaultName)}
        placeholder="Ej. Boutique Alaia"
        className={FIELD}
      />
      {state.error && (
        <p role="alert" className="text-[13px] leading-snug text-danger">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 min-h-12 rounded-lg bg-brand px-4 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creando tu negocio…" : "Empezar"}
      </button>
    </motion.form>
  );
}
