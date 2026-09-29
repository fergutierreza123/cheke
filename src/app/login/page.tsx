"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const prefersReducedMotion = useReducedMotion();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          prefersReducedMotion
            ? { duration: 0.15 }
            : { type: "spring", bounce: 0, duration: 0.4 }
        }
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-[0_24px_60px_rgba(11,16,48,0.10)]"
      >
        <Image
          src="/logos/cheke-color.png"
          alt="Cheke"
          width={140}
          height={76}
          className="mx-auto mb-2"
        />
        <h1 className="text-display mt-4 text-center font-heading text-xl font-semibold text-ink">
          Entrar a Cheke
        </h1>
        <p className="mt-1 text-center text-sm text-ink-muted">
          Te enviamos un enlace mágico a tu correo, sin contraseña.
        </p>

        {status === "sent" ? (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.15 }
                : { type: "spring", bounce: 0, duration: 0.35 }
            }
            className="mt-6 rounded-lg border border-accent bg-accent-tint px-4 py-3 text-sm text-brand-dark"
          >
            Revisa tu correo <strong>{email}</strong> y haz clic en el enlace para
            entrar.
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Correo electrónico
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@negocio.com"
              className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
            {status === "error" && (
              <p className="text-sm text-danger">{errorMessage}</p>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="mt-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {status === "sending" ? "Enviando…" : "Enviar enlace mágico"}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
