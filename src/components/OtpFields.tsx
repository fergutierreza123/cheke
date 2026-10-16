"use client";

import { useEffect, useRef, useState } from "react";
import { CODE_LENGTH, HN_PREFIX, RESEND_SECONDS, formatLocal } from "@/lib/auth/phone";

// The pieces shared by the login screen and "Mi cuenta" (adding or changing
// the cell number): the +504 number field, the 6-digit code field and the
// "Reenviar código" countdown.

export const FIELD =
  "min-h-12 w-full rounded-lg border border-border bg-surface-2 px-3.5 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-brand focus:ring-2 focus:ring-brand-tint";

// "+504" fixed on the left, the 8 digits typed as "9999-9999". Pasting a
// full "+504 9999 9999" also works. The raw text is passed up as is, so the
// caller can tell a foreign number apart from an incomplete one.
export function PhoneInput({
  id,
  value,
  onChange,
  autoFocus,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  return (
    <div
      className={`flex min-h-12 items-center overflow-hidden rounded-lg border bg-surface-2 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-tint ${
        invalid ? "border-danger" : "border-border"
      }`}
    >
      <span className="flex items-center self-stretch border-r border-border px-3.5 text-[16px] font-semibold tabular-nums text-ink">
        {HN_PREFIX}
      </span>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        autoFocus={autoFocus}
        placeholder="9999-9999"
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const raw = e.target.value;
          // Format only plain local digits; keep anything with a "+" or extra
          // digits untouched so the caller can explain it.
          const digits = raw.replace(/\D/g, "");
          onChange(!raw.includes("+") && digits.length <= 8 ? formatLocal(digits) : raw);
        }}
        className="min-w-0 flex-1 bg-transparent px-3.5 text-[17px] tracking-wide text-ink tabular-nums outline-none placeholder:text-ink-soft"
      />
    </div>
  );
}

// One field for the whole code, so iPhone's "From Messages" suggestion,
// Android's keyboard suggestion and password managers can fill it in one
// tap (autocomplete="one-time-code"). Calls onComplete once 6 digits are in.
// On Android Chrome it also listens for the SMS with the WebOTP API (needs
// the message to end with "@cheke.io #123456"; ignored where unsupported).
export function CodeInput({
  id,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  listenForSms,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  listenForSms?: boolean;
}) {
  const completeRef = useRef(onComplete);
  const changeRef = useRef(onChange);
  useEffect(() => {
    completeRef.current = onComplete;
    changeRef.current = onChange;
  });

  useEffect(() => {
    if (!listenForSms || typeof window === "undefined" || !("OTPCredential" in window)) return;
    const controller = new AbortController();
    const request = { otp: { transport: ["sms"] }, signal: controller.signal } as CredentialRequestOptions;
    navigator.credentials
      .get(request)
      .then((credential) => {
        const code = (credential as (Credential & { code?: string }) | null)?.code?.replace(/\D/g, "");
        if (code && code.length === CODE_LENGTH) {
          changeRef.current(code);
          completeRef.current(code);
        }
      })
      .catch(() => {
        // Aborted, timed out or not allowed: typing the code still works.
      });
    return () => controller.abort();
  }, [listenForSms]);

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={CODE_LENGTH}
      autoFocus
      disabled={disabled}
      value={value}
      aria-invalid={invalid || undefined}
      placeholder="······"
      onChange={(e) => {
        const code = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
        onChange(code);
        if (code.length === CODE_LENGTH) onComplete(code);
      }}
      className={`min-h-14 w-full rounded-lg border bg-surface-2 px-3.5 text-center font-heading text-[26px] font-semibold tracking-[0.45em] text-ink tabular-nums outline-none transition-colors placeholder:text-ink-soft/60 focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60 ${
        invalid ? "border-danger" : "border-border"
      }`}
    />
  );
}

// Seconds left before another code can be requested. `restart()` after
// each successful send.
export function useResendCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until, now]);

  const secondsLeft = Math.max(0, Math.ceil((until - now) / 1000));
  return {
    secondsLeft,
    restart: () => {
      const t = Date.now();
      setNow(t);
      setUntil(t + RESEND_SECONDS * 1000);
    },
  };
}

export function ResendButton({ secondsLeft, onResend, busy }: { secondsLeft: number; onResend: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onResend}
      disabled={secondsLeft > 0 || busy}
      className="text-[13.5px] font-semibold text-brand disabled:font-normal disabled:text-ink-soft"
    >
      {busy ? "Enviando…" : secondsLeft > 0 ? `Reenviar código en ${secondsLeft} s` : "Reenviar código"}
    </button>
  );
}
