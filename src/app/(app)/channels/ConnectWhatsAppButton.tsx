"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { connectWhatsAppChannel } from "./actions";
import { loadFacebookSdk } from "./facebookSdk";
import { ConnectInBrowser } from "./ConnectInBrowser";
import { useIsNativeApp } from "@/components/NativeApp";

// Meta's "Embedded Signup" (v4): a Facebook popup where the business owner
// either connects the number they already use in the WhatsApp Business app
// (coexistence — they keep using the app on their phone) or picks/creates a
// new WhatsApp Business Account and number. Which options the popup offers
// comes from the Facebook Login for Business configuration in Meta's App
// Dashboard (NEXT_PUBLIC_META_CONFIG_ID), not from this code. Meta answers in
// two separate pieces — an authorization `code` (from FB.login's callback)
// and the chosen account (a postMessage from the popup) — and they can
// arrive in either order, so we wait for both before calling the server.

// `storeId`: the Tienda the number is connected to. `label` / `hint`: the
// same button reconnects a number Meta disconnected ("Reconectar WhatsApp").
export function ConnectWhatsAppButton({
  appId,
  configId,
  storeId,
  label = "Conectar WhatsApp",
  hint = true,
}: {
  appId: string;
  configId: string;
  storeId: string;
  label?: string;
  hint?: boolean;
}) {
  const router = useRouter();
  const native = useIsNativeApp();
  const [status, setStatus] = useState<"idle" | "opening" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<{ wabaId: string; phoneNumberId: string | null; coexistence: boolean } | null>(null);

  async function maybeFinish() {
    if (!codeRef.current || !sessionRef.current) return;
    const input = { code: codeRef.current, storeId, ...sessionRef.current };
    codeRef.current = null;
    sessionRef.current = null;
    setStatus("saving");
    const result = await connectWhatsAppChannel(input);
    setStatus("idle");
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.warning) setWarning(result.warning);
    router.refresh();
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      let host: string;
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (!(host === "facebook.com" || host.endsWith(".facebook.com")) || typeof event.data !== "string") return;
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          sessionRef.current = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id ?? null,
            coexistence: data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          };
          void maybeFinish();
        } else if (data.event === "FINISH_ONLY_WABA") {
          // Finished without adding a number: nothing to receive messages on.
          codeRef.current = null;
          setStatus("idle");
          setError("Terminaste sin agregar un número. Vuelve a intentarlo y elige o agrega tu número de WhatsApp.");
        } else if (data.event === "CANCEL" || data.event === "ERROR") {
          codeRef.current = null;
          setStatus("idle");
          if (data.data?.error_message) setError(`Meta: ${data.data.error_message}`);
        }
      } catch {
        // not one of ours
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // maybeFinish only reads refs and stable setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (native) return <ConnectInBrowser label={label} color="#25D366" />;

  async function handleClick() {
    setError(null);
    setWarning(null);
    setStatus("opening");
    codeRef.current = null;
    sessionRef.current = null;
    try {
      const FB = await loadFacebookSdk(appId);
      FB.login(
        (response) => {
          const code = response.authResponse?.code;
          if (!code) {
            setStatus("idle");
            return;
          }
          codeRef.current = code;
          void maybeFinish();
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          // v4: everything (coexistence, products) comes from the login
          // configuration in Meta's App Dashboard, so extras stays empty.
          extras: { setup: {} },
        },
      );
    } catch {
      setStatus("idle");
      setError("No se pudo abrir la ventana de Meta. Revisa tu conexión e intenta de nuevo.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={status !== "idle"}
        className="flex h-10 items-center justify-center rounded-[10px] bg-[#25D366] px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {status === "opening" ? "Abriendo Meta…" : status === "saving" ? "Conectando…" : label}
      </button>
      {hint && (
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          ¿Ya usas WhatsApp Business en tu teléfono? Conecta ese mismo número: sigues usando la app y tus chats de
          los últimos 6 meses llegan a cheke.
        </p>
      )}
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      {warning && <p className="text-[12.5px] text-ink-muted">{warning}</p>}
    </div>
  );
}
