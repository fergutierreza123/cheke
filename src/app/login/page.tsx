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

type Phase = "request" | "code";

function LoginForm() {
  const [phase, setPhase] = useState<Phase>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const prefersReducedMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const callbackFailed = searchParams.get("error") === "auth";

  async function sendCode(targetEmail: string) {
    const supabase = createClient();
    // No emailRedirectTo here on purpose — that option is for the
    // click-a-link flow. We only want the 6-digit code this time, which
    // verifyOtp() below checks directly, no redirect involved.
    const { error } = await supabase.auth.signInWithOtp({ email: targetEmail });
    return error;
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setErrorMessage("");

    const error = await sendCode(email);

    setSending(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setPhase("code");
  }

  async function handleResend() {
    setResending(true);
    setErrorMessage("");
    const error = await sendCode(email);
    setResending(false);
    if (error) setErrorMessage(error.message);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

    if (error) {
      setVerifying(false);
      setErrorMessage("Código incorrecto o vencido. Intenta de nuevo.");
      return;
    }
    // Full reload (not router.push) so the server picks up the new
    // session cookie right away — same reasoning as the OAuth/magic-link
    // redirects, which both land on a fresh server request too.
    window.location.href = "/chekeo";
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
          Te enviamos un código a tu correo, sin contraseña.
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
          {phase === "code" ? (
            <motion.form
              onSubmit={handleVerifyCode}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.15 }
                  : { type: "spring", bounce: 0, duration: 0.35 }
              }
              className="flex flex-col gap-3"
            >
              <p className="text-sm text-ink-muted">
                Escribe el código de 6 dígitos que enviamos a <strong className="text-ink">{email}</strong>.
                Si llega por correo en tu teléfono, puede que se rellene solo.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center text-2xl font-semibold tracking-[0.5em] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
              />
              {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="mt-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {verifying ? "Verificando…" : "Verificar código"}
              </button>
              <div className="flex items-center justify-between text-[12.5px]">
                <button
                  type="button"
                  onClick={() => {
                    setPhase("request");
                    setCode("");
                    setErrorMessage("");
                  }}
                  className="text-ink-muted hover:underline"
                >
                  Usar otro correo
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="font-semibold text-brand hover:underline disabled:opacity-60"
                >
                  {resending ? "Reenviando…" : "Reenviar código"}
                </button>
              </div>
            </motion.form>
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

              <form onSubmit={handleRequestCode} className="flex flex-col gap-3">
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
                {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
                <button
                  type="submit"
                  disabled={sending}
                  className="mt-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {sending ? "Enviando…" : "Enviar código"}
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
