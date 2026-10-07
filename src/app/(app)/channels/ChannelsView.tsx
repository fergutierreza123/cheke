"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChannelIcon } from "@/components/ChannelIcon";
import { relativeTime } from "@/lib/format";
import type { ChannelType } from "@/lib/types";
import { ConnectWhatsAppButton } from "./ConnectWhatsAppButton";
import { disconnectChannel } from "./actions";

export type ChannelItem = {
  id: string;
  type: ChannelType;
  status: "disconnected" | "connected" | "error";
  external_id: string | null;
  display_phone: string | null;
  verified_name: string | null;
  connected_at: string | null;
};

export function ChannelsView({
  channels,
  isOwner,
  meta,
}: {
  channels: ChannelItem[];
  isOwner: boolean;
  // null until Meta's app + Embedded Signup are configured on the server
  meta: { appId: string; configId: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whatsapp = channels.find((c) => c.type === "whatsapp");
  const whatsappConnected = whatsapp?.status === "connected";

  async function handleDisconnect(id: string) {
    if (!window.confirm("¿Desconectar WhatsApp? Dejarás de recibir y enviar mensajes por ese número desde cheke.")) return;
    setBusy(true);
    setError(null);
    const result = await disconnectChannel(id);
    setBusy(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-1 border-b border-border bg-surface px-4 py-3.5 lg:px-8 lg:py-[18px]">
        <h1 className="font-heading text-xl font-semibold text-ink">Canales</h1>
        <p className="hidden text-[13.5px] text-ink-muted sm:block">
          Conecta tus redes para recibir todos los mensajes en un solo buzón
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
        <div className="mx-auto grid max-w-3xl gap-3">
          {/* WhatsApp */}
          <div className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
            <div className="flex items-start gap-3">
              <ChannelIcon type="whatsapp" className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-[15.5px] font-semibold text-ink">WhatsApp</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      whatsappConnected ? "bg-accent-tint text-brand-dark" : "bg-surface-2 text-ink-muted"
                    }`}
                  >
                    {whatsappConnected ? "Conectado" : "Sin conectar"}
                  </span>
                </div>
                {whatsappConnected ? (
                  <p className="mt-1 text-[13.5px] text-ink-muted">
                    {whatsapp?.verified_name ? <strong className="text-ink">{whatsapp.verified_name}</strong> : null}
                    {whatsapp?.verified_name && whatsapp?.display_phone ? " · " : null}
                    {whatsapp?.display_phone ?? (whatsapp?.verified_name ? null : "Número de prueba")}
                    {whatsapp?.connected_at ? ` · conectado ${relativeTime(whatsapp.connected_at)}` : null}
                  </p>
                ) : (
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                    Recibe y responde los mensajes de WhatsApp de tus clientes desde cheke, con chekelin atendiendo
                    la primera respuesta.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4">
              {!isOwner ? (
                <p className="text-[12.5px] text-ink-soft">Solo el dueño del negocio puede conectar o desconectar canales.</p>
              ) : whatsappConnected && whatsapp ? (
                <button
                  onClick={() => handleDisconnect(whatsapp.id)}
                  disabled={busy}
                  className="h-10 rounded-[10px] border border-danger-border bg-danger-tint px-4 text-[13.5px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
                >
                  {busy ? "Desconectando…" : "Desconectar"}
                </button>
              ) : meta ? (
                <ConnectWhatsAppButton appId={meta.appId} configId={meta.configId} />
              ) : (
                <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                  La conexión con WhatsApp se activa cuando Meta termine de verificar el negocio de cheke. Mientras
                  tanto puedes probar chekelin con el modo prueba del Chat.
                </div>
              )}
              {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
            </div>
          </div>

          {/* Instagram + Facebook: Phase 7 */}
          {(["instagram", "facebook"] as const).map((type) => (
            <div key={type} className="rounded-2xl border border-border bg-surface p-4 opacity-80 lg:p-5">
              <div className="flex items-center gap-3">
                <ChannelIcon type={type} className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading text-[15.5px] font-semibold text-ink">
                      {type === "instagram" ? "Instagram" : "Facebook Messenger"}
                    </h2>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                      Próximamente
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] text-ink-muted">
                    Los mensajes directos llegarán al mismo buzón que WhatsApp.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
