"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { CODE_LENGTH, formatPhone, isForeignNumber, localDigits, toE164 } from "@/lib/auth/phone";
import { sendErrorMessage, verifyErrorMessage } from "@/lib/auth/errors";
import { CodeInput, PhoneInput, ResendButton, useResendCooldown } from "@/components/OtpFields";

// Mi cuenta → "Agregar mi celular" / "Cambiar mi celular". Links a +504
// number to this same account, verified with an SMS code (Supabase
// updateUser + verifyOtp type "phone_change"). Afterwards the person can
// log in with either their email or their phone.
export function PhoneRow({ phone, demo = false }: { phone: string; demo?: boolean }) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const cooldown = useResendCooldown();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"enter" | "code">("enter");
  const [input, setInput] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function close() {
    setOpen(false);
    setStep("enter");
    setInput("");
    setCode("");
    setError("");
  }

  async function send(target: string) {
    setBusy(true);
    setError("");
    const { error: sendError } = await createClient().auth.updateUser({ phone: target });
    setBusy(false);
    if (sendError) {
      setError(sendErrorMessage(sendError, "phone"));
      return;
    }
    setSentTo(target);
    setCode("");
    setStep("code");
    cooldown.restart();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (busy || demo) return;
    if (isForeignNumber(input)) return setError("Por ahora solo se pueden agregar celulares de Honduras (+504).");
    const local = localDigits(input);
    if (!local) return setError("Escribe los 8 números de tu celular.");
    if (formatPhone(toE164(local)) === phone) return setError("Ese ya es tu número.");
    await send(toE164(local));
  }

  async function verify(token: string) {
    if (busy || token.length !== CODE_LENGTH) return;
    setBusy(true);
    setError("");
    const { error: verifyError } = await createClient().auth.verifyOtp({ phone: sentTo, token, type: "phone_change" });
    setBusy(false);
    if (verifyError) {
      setError(verifyErrorMessage(verifyError));
      setCode("");
      return;
    }
    close();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  return (
    <div className="border-b border-border px-5 py-3.5 text-[13.5px]">
      <div className="flex items-center justify-between gap-4">
        <span className="text-ink-muted">Celular</span>
        <span className="flex min-w-0 items-center gap-3">
          {phone && <span className="whitespace-nowrap font-semibold text-ink">{saved ? "¡Guardado!" : phone}</span>}
          {!open && (
            <button type="button" onClick={() => setOpen(true)} className="shrink-0 font-semibold text-brand">
              {phone ? (
                <>
                  Cambiar<span className="hidden sm:inline"> mi celular</span>
                </>
              ) : (
                "Agregar mi celular"
              )}
            </button>
          )}
        </span>
      </div>

      {open && (
        <motion.div
          key={step}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
          className="mt-3"
        >
          {step === "enter" ? (
            <form onSubmit={handleSend} noValidate className="flex flex-col gap-2.5">
              <label htmlFor="account-phone" className="text-[12.5px] text-ink-soft">
                Te enviamos un código por mensaje de texto para confirmarlo. Después puedes entrar con tu celular o tu
                correo.
              </label>
              <PhoneInput
                id="account-phone"
                value={input}
                onChange={(v) => {
                  setInput(v);
                  if (error) setError("");
                }}
                invalid={Boolean(error)}
                autoFocus
              />
              {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={close} className="min-h-11 flex-1 rounded-[10px] border border-border text-[13.5px] font-semibold text-ink">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy || demo}
                  className="min-h-11 flex-1 rounded-[10px] bg-brand text-[13.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Enviando…" : "Enviarme el código"}
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify(code);
              }}
              className="flex flex-col gap-2.5"
            >
              <label htmlFor="account-code" className="text-[12.5px] text-ink-soft">
                Escribe el código que enviamos a <strong className="text-ink">{formatPhone(sentTo)}</strong>.
              </label>
              <CodeInput
                id="account-code"
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (error) setError("");
                }}
                onComplete={(c) => void verify(c)}
                disabled={busy}
                invalid={Boolean(error)}
                listenForSms
              />
              {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={close} className="py-1 text-[13px] text-ink-muted underline underline-offset-2">
                  Cancelar
                </button>
                <ResendButton secondsLeft={cooldown.secondsLeft} busy={busy && code.length < CODE_LENGTH} onResend={() => void send(sentTo)} />
              </div>
              <button
                type="submit"
                disabled={busy || code.length !== CODE_LENGTH}
                className="min-h-11 rounded-[10px] bg-brand text-[13.5px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Confirmando…" : "Confirmar"}
              </button>
            </form>
          )}
        </motion.div>
      )}
    </div>
  );
}
