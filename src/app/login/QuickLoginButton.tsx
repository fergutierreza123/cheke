"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsNativeApp } from "@/components/NativeApp";
import { NATIVE_APP_HOME } from "@/lib/nativeApp";
import { biometricLabel, getBiometricKind, isBiometricLoginOn, restoreSessionWithBiometrics } from "@/lib/biometricLogin";
import { browserSupportsPasskeys, passkeyUsedOnThisDevice, signInWithPasskey } from "@/lib/passkeyLogin";
import { finishSignIn } from "./actions";

// The login screen's shortcut, only for people who turned it on in Mi
// cuenta (GitHub issue #44). Renders nothing otherwise, so the screen stays
// exactly the code login from issue #12.
// - In the app: asks for Face ID / fingerprint as soon as the screen opens
//   and goes straight to Chat. Cancel → the code form below is right there.
// - On the web: a button that signs in with this device's passkey.
export function QuickLoginButton() {
  const isNative = useIsNativeApp();
  const router = useRouter();
  const [label, setLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const autoPrompted = useRef(false);

  async function enterWithBiometrics() {
    setBusy(true);
    setMessage("");
    const result = await restoreSessionWithBiometrics();
    if (result === "ok") {
      router.replace(NATIVE_APP_HOME);
      router.refresh();
      return;
    }
    setBusy(false);
    if (result === "expired") {
      setLabel(null);
      setMessage("Entra con tu código. Después puedes volver a activar esta opción en Mi cuenta.");
    } else if (result === "failed") {
      setMessage("No se pudo entrar. Revisa tu internet o entra con tu código.");
    }
  }

  async function enterWithPasskey() {
    setBusy(true);
    setMessage("");
    const result = await signInWithPasskey();
    if (result.ok) {
      // Same next step as the code login (invitation, onboarding or Chat).
      const finished = await finishSignIn();
      if (finished?.error) setMessage(finished.error);
    } else {
      setMessage(result.error);
      if (!passkeyUsedOnThisDevice()) setLabel(null);
    }
    setBusy(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isNative) {
        if (!(await isBiometricLoginOn())) return;
        const kind = await getBiometricKind();
        if (!kind || cancelled) return;
        setLabel(biometricLabel(kind));
        // Ask right away, once: opening the app = looking at the phone.
        if (!autoPrompted.current) {
          autoPrompted.current = true;
          void enterWithBiometrics();
        }
      } else if (passkeyUsedOnThisDevice() && (await browserSupportsPasskeys()) && !cancelled) {
        setLabel("Entrar con huella o rostro");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per platform answer; the handlers only read refs/setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative]);

  if (!label) {
    return message ? <p role="status" className="mb-4 text-[13px] leading-snug text-ink-muted">{message}</p> : null;
  }

  return (
    <div className="mb-5 flex flex-col gap-2 border-b border-border pb-5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void (isNative ? enterWithBiometrics() : enterWithPasskey())}
        className="min-h-12 rounded-lg border border-brand px-4 text-[15px] font-semibold text-brand transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Entrando…" : label}
      </button>
      {message && (
        <p role="status" className="text-[13px] leading-snug text-ink-muted">
          {message}
        </p>
      )}
      <p className="text-center text-[12.5px] text-ink-soft">o entra con un código</p>
    </div>
  );
}
