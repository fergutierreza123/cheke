"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { connectWhatsAppChannel } from "./actions";

// Meta's "Embedded Signup": a Facebook popup where the business owner picks
// or creates their WhatsApp Business Account and number. Meta answers in two
// separate pieces — an authorization `code` (from FB.login's callback) and
// the chosen WABA / phone number (a postMessage from the popup) — and they
// can arrive in either order, so we wait for both before calling the server.

type FacebookSdk = {
  init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } | null }) => void,
    options: Record<string, unknown>,
  ) => void;
};
declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(appId: string): Promise<FacebookSdk> {
  return new Promise((resolve) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    document.body.appendChild(script);
  });
}

export function ConnectWhatsAppButton({ appId, configId }: { appId: string; configId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "opening" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<{ phoneNumberId: string; wabaId: string } | null>(null);

  async function maybeFinish() {
    if (!codeRef.current || !sessionRef.current) return;
    const input = { code: codeRef.current, ...sessionRef.current };
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
      if (!event.origin.endsWith("facebook.com") || typeof event.data !== "string") return;
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH") {
          sessionRef.current = { phoneNumberId: data.data.phone_number_id, wabaId: data.data.waba_id };
          void maybeFinish();
        } else if (data.event === "CANCEL") {
          setStatus("idle");
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
          extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
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
        {status === "opening" ? "Abriendo Meta…" : status === "saving" ? "Conectando…" : "Conectar WhatsApp"}
      </button>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      {warning && <p className="text-[12.5px] text-ink-muted">{warning}</p>}
    </div>
  );
}
