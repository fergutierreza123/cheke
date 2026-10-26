"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChannelIcon } from "@/components/ChannelIcon";
import { connectMetaPage, startMetaConnection, type MetaPageOption } from "./metaActions";
import { loadFacebookSdk } from "./facebookSdk";
import { ConnectInBrowser } from "./ConnectInBrowser";
import { useIsNativeApp } from "@/components/NativeApp";

// "Conectar Instagram y Facebook": Facebook Login for Business with its own
// configuration (NEXT_PUBLIC_META_MESSAGING_CONFIG_ID, which asks for the
// Page + Instagram messaging permissions). Same FB.login + server code
// exchange as WhatsApp. If the owner manages several Pages, they pick one
// here; its linked Instagram account comes with it.
export function ConnectMetaButton({
  appId,
  configId,
  storeId,
  label = "Conectar Instagram y Facebook",
}: {
  appId: string;
  configId: string;
  // The Tienda the Page and its Instagram are connected to.
  storeId: string;
  label?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "opening" | "loading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ session: string; pages: MetaPageOption[]; selected: string } | null>(null);
  const native = useIsNativeApp();

  if (native) return <ConnectInBrowser label={label} color="var(--color-brand)" />;

  async function finish(session: string, pageId: string) {
    setStatus("saving");
    const result = await connectMetaPage(session, pageId);
    setStatus("idle");
    if (result.error) {
      setError(result.error);
      return;
    }
    setChoice(null);
    if (result.warning) setWarning(result.warning);
    router.refresh();
  }

  async function onCode(code: string) {
    setStatus("loading");
    const result = await startMetaConnection(code, storeId);
    if (result.error || !result.session || !result.pages) {
      setStatus("idle");
      setError(result.error ?? "Meta no devolvió tus páginas.");
      return;
    }
    if (result.pages.length === 1) {
      await finish(result.session, result.pages[0].id);
      return;
    }
    setStatus("idle");
    setChoice({ session: result.session, pages: result.pages, selected: result.pages[0].id });
  }

  async function handleClick() {
    setError(null);
    setWarning(null);
    setChoice(null);
    setStatus("opening");
    try {
      const FB = await loadFacebookSdk(appId);
      FB.login(
        (response) => {
          const code = response.authResponse?.code;
          if (!code) {
            setStatus("idle");
            return;
          }
          void onCode(code);
        },
        { config_id: configId, response_type: "code", override_default_response_type: true },
      );
    } catch {
      setStatus("idle");
      setError("No se pudo abrir la ventana de Meta. Revisa tu conexión e intenta de nuevo.");
    }
  }

  if (choice) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink">¿Qué página quieres conectar?</p>
        <div className="flex flex-col gap-1.5" role="radiogroup">
          {choice.pages.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 text-[13.5px] transition-colors ${
                choice.selected === p.id ? "border-brand bg-brand-tint" : "border-border bg-surface hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="meta-page"
                value={p.id}
                checked={choice.selected === p.id}
                onChange={() => setChoice({ ...choice, selected: p.id })}
                className="accent-brand"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <ChannelIcon type="facebook" className="h-4 w-4 shrink-0 rounded-full" />
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                  {p.instagram ? (
                    <>
                      <ChannelIcon type="instagram" className="h-4 w-4 shrink-0 rounded-full" />
                      <span className="truncate">{p.instagram.username ? `@${p.instagram.username}` : "Instagram vinculado"}</span>
                    </>
                  ) : (
                    "Sin Instagram vinculado"
                  )}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => finish(choice.session, choice.selected)}
            disabled={status !== "idle"}
            className="flex h-10 items-center justify-center rounded-[10px] bg-brand px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {status === "saving" ? "Conectando…" : "Conectar esta página"}
          </button>
          <button
            onClick={() => setChoice(null)}
            disabled={status !== "idle"}
            className="h-10 rounded-[10px] border border-border bg-surface px-4 text-[13.5px] font-semibold text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={status !== "idle"}
        className="flex h-10 items-center justify-center self-start rounded-[10px] bg-brand px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {status === "opening"
          ? "Abriendo Meta…"
          : status === "loading"
            ? "Buscando tus páginas…"
            : status === "saving"
              ? "Conectando…"
              : label}
      </button>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      {warning && <p className="text-[12.5px] text-ink-muted">{warning}</p>}
    </div>
  );
}
