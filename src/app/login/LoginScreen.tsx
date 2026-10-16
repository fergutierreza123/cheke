"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, isForeignNumber, isHondurasE164, localDigits, toE164, CODE_LENGTH } from "@/lib/auth/phone";
import { SMS_UNAVAILABLE, USE_EMAIL_INSTEAD, sendErrorMessage, verifyErrorMessage, type CodeChannel } from "@/lib/auth/errors";
import { CodeInput, FIELD, PhoneInput, ResendButton, useResendCooldown } from "@/components/OtpFields";
import { finishSignIn } from "./actions";
import { QuickLoginButton } from "./QuickLoginButton";

// Login with a 6-digit code, no passwords (design: GitHub issue #12).
// Main path: "Tu número de celular" (+504) and a code by SMS (Supabase phone
// auth, sent through Twilio Verify). Small alternative: "Prefiero usar mi
// correo" and the same kind of code by email. The browser talks to Supabase
// directly, so each person's own connection counts toward Supabase's
// per-device limits; afterwards finishSignIn() decides where they go.
// Same screen on the web and inside the iPhone/Android app. People who
// turned on Face ID / fingerprint (app) or a passkey (web) in Mi cuenta also
// get that shortcut on top (QuickLoginButton, issue #44).

type Step = "enter" | "code";

export function LoginScreen({ reviewerLoginEnabled }: { reviewerLoginEnabled: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const [channel, setChannel] = useState<CodeChannel>("phone");
  const [step, setStep] = useState<Step>("enter");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // What the code was sent to, fixed once sent: "+50499999999" or the email.
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  // The number is from another country: offer email right in the message.
  const [suggestEmail, setSuggestEmail] = useState(false);
  const cooldown = useResendCooldown();
  // Autofill, the 6th digit and "Entrar" can all fire at once: verify once.
  const verifyingRef = useRef(false);

  const spring = prefersReducedMotion ? { duration: 0.15 } : ({ type: "spring", bounce: 0, duration: 0.35 } as const);

  function switchChannel(next: CodeChannel) {
    setChannel(next);
    setStep("enter");
    setError("");
    setSuggestEmail(false);
    setCode("");
  }

  async function sendCode(target: string) {
    setSending(true);
    setError("");
    setSuggestEmail(false);
    const supabase = createClient();
    const { error: sendError } =
      channel === "phone"
        ? await supabase.auth.signInWithOtp({ phone: target, options: { channel: "sms", shouldCreateUser: true } })
        : await supabase.auth.signInWithOtp({ email: target, options: { shouldCreateUser: true } });
    setSending(false);
    if (sendError) {
      const message = sendErrorMessage(sendError, channel);
      setError(message);
      setSuggestEmail(message === SMS_UNAVAILABLE || message === USE_EMAIL_INSTEAD);
      return false;
    }
    setSentTo(target);
    setCode("");
    setStep("code");
    cooldown.restart();
    return true;
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (channel === "phone") {
      if (isForeignNumber(phone)) {
        setError(USE_EMAIL_INSTEAD);
        setSuggestEmail(true);
        return;
      }
      const local = localDigits(phone);
      if (!local || !isHondurasE164(toE164(local))) {
        setError("Escribe los 8 números de tu celular.");
        setSuggestEmail(false);
        return;
      }
      await sendCode(toE164(local));
    } else {
      const value = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setError("Escribe tu correo completo, por ejemplo tu@negocio.com.");
        return;
      }
      await sendCode(value);
    }
  }

  async function verify(token: string) {
    if (verifyingRef.current || token.length !== CODE_LENGTH) return;
    verifyingRef.current = true;
    setVerifying(true);
    setError("");
    const supabase = createClient();
    const { error: verifyError } =
      channel === "phone"
        ? await supabase.auth.verifyOtp({ phone: sentTo, token, type: "sms" })
        : await supabase.auth.verifyOtp({ email: sentTo, token, type: "email" });
    if (verifyError) {
      verifyingRef.current = false;
      setVerifying(false);
      setError(verifyErrorMessage(verifyError));
      setCode("");
      return;
    }
    // Navigates away (invitation, onboarding or Chat); only returns on error.
    const result = await finishSignIn();
    if (result?.error) {
      verifyingRef.current = false;
      setVerifying(false);
      setError(result.error);
    }
  }

  const sentLabel = channel === "phone" ? formatPhone(sentTo) : sentTo;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-brand-dark px-4"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="w-full max-w-sm">
        <Image src="/logos/cheke-icon-blue.png" alt="Cheke" width={64} height={75} className="mx-auto mb-4" />
        <h1 className="text-display text-center font-heading text-2xl font-semibold text-white">
          Entrar a <span className="text-accent">cheke</span>
        </h1>
        <p className="mt-1 text-center text-sm text-white/70">Te enviamos un código para entrar, sin contraseña.</p>

        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.4 }}
          className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_60px_rgba(0,16,55,0.25)]"
        >
          {/* Face ID / fingerprint (app) or passkey (web), only for people
              who turned it on in Mi cuenta. Outside the step animation and
              mounted once, so the prompt isn't asked again on every step. */}
          <div hidden={step !== "enter"}>
            <QuickLoginButton />
          </div>
          <motion.div
            // Steps move forward to the right and back to the left.
            key={`${channel}-${step}`}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: step === "code" ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring}
          >
            {step === "enter" ? (
              <form onSubmit={handleSend} noValidate className="flex flex-col gap-3">
                <label htmlFor={channel === "phone" ? "login-phone" : "login-email"} className="font-heading text-[15px] font-semibold text-ink">
                  {channel === "phone" ? "Tu número de celular" : "Tu correo"}
                </label>
                {channel === "phone" ? (
                  <PhoneInput
                    id="login-phone"
                    value={phone}
                    onChange={(v) => {
                      setPhone(v);
                      if (error) setError("");
                    }}
                    invalid={Boolean(error)}
                    autoFocus
                  />
                ) : (
                  <input
                    id="login-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoFocus
                    placeholder="tu@negocio.com"
                    value={email}
                    aria-invalid={Boolean(error) || undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    className={`${FIELD} ${error ? "border-danger" : ""}`}
                  />
                )}
                {error && (
                  <p role="alert" className="text-[13px] leading-snug text-danger">
                    {error}{" "}
                    {suggestEmail && (
                      <button type="button" onClick={() => switchChannel("email")} className="font-semibold text-brand underline underline-offset-2">
                        Usar mi correo
                      </button>
                    )}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  className="mt-1 min-h-12 rounded-lg bg-brand px-4 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {sending ? "Enviando…" : "Enviarme el código"}
                </button>
                <button
                  type="button"
                  onClick={() => switchChannel(channel === "phone" ? "email" : "phone")}
                  className="mt-1 self-center py-1 text-[13.5px] text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  {channel === "phone" ? "Prefiero usar mi correo" : "Prefiero usar mi celular"}
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify(code);
                }}
                className="flex flex-col gap-3"
              >
                <label htmlFor="login-code" className="font-heading text-[15px] font-semibold text-ink">
                  Escribe el código
                </label>
                <p className="-mt-1.5 text-[13.5px] leading-snug text-ink-muted">
                  Te lo enviamos {channel === "phone" ? "por mensaje de texto a" : "a tu correo"}{" "}
                  <strong className="whitespace-nowrap font-semibold text-ink">{sentLabel}</strong>.
                </p>
                <CodeInput
                  id="login-code"
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    if (error) setError("");
                  }}
                  onComplete={(c) => void verify(c)}
                  disabled={verifying}
                  invalid={Boolean(error)}
                  listenForSms={channel === "phone"}
                />
                {error && (
                  <p role="alert" className="text-[13px] leading-snug text-danger">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={verifying || code.length !== CODE_LENGTH}
                  className="mt-1 min-h-12 rounded-lg bg-brand px-4 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {verifying ? "Entrando…" : "Entrar"}
                </button>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("enter");
                      setError("");
                    }}
                    className="py-1 text-[13.5px] text-ink-muted underline underline-offset-2 hover:text-ink"
                  >
                    {channel === "phone" ? "Cambiar número" : "Cambiar correo"}
                  </button>
                  <ResendButton secondsLeft={cooldown.secondsLeft} busy={sending} onResend={() => void sendCode(sentTo)} />
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>

        {/* App Store / Google Play reviewers can't receive a code; they get
            a fixed demo login (only when REVIEWER_EMAIL/PASSWORD are set). */}
        {reviewerLoginEnabled && (
          <Link href="/login/revisores" className="mt-5 block text-center text-[12.5px] text-white/60 underline underline-offset-2">
            Acceso para revisores
          </Link>
        )}
      </div>
    </div>
  );
}
