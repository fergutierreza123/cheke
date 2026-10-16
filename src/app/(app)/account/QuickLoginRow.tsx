"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useIsNativeApp } from "@/components/NativeApp";
import {
  biometricLabel,
  getBiometricKind,
  isBiometricLoginOn,
  turnOffBiometricLogin,
  turnOnBiometricLogin,
} from "@/lib/biometricLogin";
import { browserSupportsPasskeys, hasPasskey, turnOffPasskey, turnOnPasskey } from "@/lib/passkeyLogin";

type Mode =
  // Phone app: Face ID / Touch ID / fingerprint (src/lib/biometricLogin.ts).
  | { kind: "native"; label: string }
  // Browser: a passkey (src/lib/passkeyLogin.ts).
  | { kind: "web"; label: string };

// Mi cuenta → one on/off switch to enter cheke without waiting for a code
// (GitHub issue #44). Only shown where the device can do it: in the app
// with Face ID / fingerprint set up, or in a browser that can unlock a
// passkey with the face or finger. Hidden everywhere else.
export function QuickLoginRow() {
  const isNative = useIsNativeApp();
  const prefersReducedMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isNative) {
        const kind = await getBiometricKind();
        if (!kind || cancelled) return;
        const isOn = await isBiometricLoginOn();
        if (cancelled) return;
        setOn(isOn);
        setMode({ kind: "native", label: biometricLabel(kind) });
      } else {
        if (!(await browserSupportsPasskeys()) || cancelled) return;
        const isOn = await hasPasskey();
        if (cancelled) return;
        setOn(isOn);
        setMode({ kind: "web", label: "Entrar con huella o rostro" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNative]);

  if (!mode) return null;

  async function toggle() {
    if (busy || !mode) return;
    setBusy(true);
    setError("");
    let result: { error?: string };
    if (mode.kind === "native") {
      result = on ? (await turnOffBiometricLogin(), {}) : await turnOnBiometricLogin();
    } else {
      result = on ? await turnOffPasskey() : await turnOnPasskey();
    }
    setBusy(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setOn(!on);
  }

  const helper =
    mode.kind === "native"
      ? "Entra a cheke en este celular sin esperar un código."
      : "Entra a cheke con la huella o el rostro de este dispositivo, sin esperar un código.";

  return (
    <div className="border-b border-border px-5 py-3.5 text-[13.5px]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div id="quick-login-label" className="font-semibold text-ink">
            {mode.label}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">
            {helper}
            {mode.kind === "web" && <span className="block text-[11.5px] text-ink-soft/80">Usa una passkey.</span>}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="quick-login-label"
          disabled={busy}
          onClick={() => void toggle()}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            on ? "bg-brand" : "bg-surface-3"
          }`}
        >
          <motion.span
            aria-hidden
            className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow"
            animate={{ x: on ? 20 : 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
          />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
