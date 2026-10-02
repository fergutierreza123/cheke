"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const callbackFailed = searchParams.get("error") === "auth";

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

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    const supabase = createClient();
    // Full-page redirect to Google, then back to /auth/callback with a
    // ?code= — the same PKCE code-exchange route the email magic link
    // already uses, so no changes needed there.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setGoogleLoading(false);
      setStatus("error");
      setErrorMessage(error.message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-dark px-4">
      <div className="w-full max-w-sm">
        <Image
          src="/logos/cheke-icon-blue.png"
          alt="Cheke"
          width={64}
          height={75}
          className="mx-auto mb-4"
        />
        <h1 className="text-display text-center font-heading text-2xl font-semibold text-white">
          Entrar a <span className="text-accent">cheke</span>
        </h1>
        <p className="mt-1 text-center text-sm text-white/70">
          Te enviamos un enlace mágico a tu correo, sin contraseña.
        </p>

        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            prefersReducedMotion
              ? { duration: 0.15 }
              : { type: "spring", bounce: 0, duration: 0.4 }
          }
          className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_60px_rgba(0,16,55,0.25)]"
        >
          {status === "sent" ? (
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.15 }
                  : { type: "spring", bounce: 0, duration: 0.35 }
              }
              className="rounded-lg border border-accent bg-accent-tint px-4 py-3 text-sm text-brand-dark"
            >
              Revisa tu correo <strong>{email}</strong> y haz clic en el enlace para
              entrar.
            </motion.div>
          ) : (
            <div className="flex flex-col gap-4">
              {callbackFailed && (
                <div className="rounded-lg border border-danger-border bg-danger-tint px-3 py-2.5 text-[12.5px] text-danger">
                  No se pudo iniciar sesión. Intenta de nuevo.
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="flex items-center justify-center gap-2.5 rounded-lg border border-border bg-surface py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                <GoogleIcon className="h-[18px] w-[18px] shrink-0" />
                {googleLoading ? "Conectando…" : "Continuar con Google"}
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11.5px] uppercase tracking-wide text-ink-soft">o con tu correo</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
