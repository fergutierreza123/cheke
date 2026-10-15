"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChannelIcon } from "@/components/ChannelIcon";
import { relativeTime } from "@/lib/format";
import type { ChannelType } from "@/lib/types";
import { ConnectWhatsAppButton } from "./ConnectWhatsAppButton";
import { disconnectChannel, retryCoexistenceSync } from "./actions";
import { COEXISTENCE_SYNC_WINDOW_MS } from "@/lib/coexistence";
import { BrandMark } from "@/components/BrandMark";
import { META_BILLING_HUB_URL } from "@/lib/whatsappErrors";

export type ChannelItem = {
  id: string;
  type: ChannelType;
  status: "disconnected" | "connected" | "error";
  external_id: string | null;
  display_phone: string | null;
  verified_name: string | null;
  connected_at: string | null;
  coexistence: boolean;
  contacts_sync_requested_at: string | null;
  history_sync_requested_at: string | null;
  history_sync_progress: number | null;
  history_sync_error: string | null;
};

// Recent WhatsApp messages Meta refused because of the business's billing.
export type BillingProblem = { count: number; lastAt: string };

export function ChannelsView({
  channels,
  isOwner,
  meta,
  billingProblem,
}: {
  channels: ChannelItem[];
  isOwner: boolean;
  // null until Meta's app + Embedded Signup are configured on the server
  meta: { appId: string; configId: string } | null;
  billingProblem?: BillingProblem | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whatsapp = channels.find((c) => c.type === "whatsapp");
  const whatsappConnected = whatsapp?.status === "connected";

  async function handleRetrySync(id: string) {
    setBusy(true);
    setError(null);
    const result = await retryCoexistenceSync(id);
    setBusy(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function handleDisconnect(id: string) {
    const message = whatsapp?.coexistence
      ? "¿Desconectar WhatsApp de cheke? Tu número sigue funcionando en la app de WhatsApp Business. Para terminar de desconectarlo, en la app ve a Configuración → Cuenta → Plataforma empresarial."
      : "¿Desconectar WhatsApp? Dejarás de recibir y enviar mensajes por ese número desde cheke.";
    if (!window.confirm(message)) return;
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
        <h1 className="flex items-center justify-between gap-2 font-heading text-xl font-semibold text-ink">
            Canales
            <BrandMark />
          </h1>
        <p className="hidden text-[13.5px] text-ink-muted sm:block">
          Conecta tus redes para recibir todos los mensajes en un solo buzón
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
        <div className="mx-auto grid max-w-3xl gap-3">
          {billingProblem && <BillingBanner problem={billingProblem} isOwner={isOwner} />}

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
                {whatsappConnected && whatsapp?.coexistence && (
                  <CoexistenceStatus channel={whatsapp} isOwner={isOwner} busy={busy} onRetry={handleRetrySync} />
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

// WhatsApp stopped delivering replies because of the business's Meta
// billing. Since Oct 1, 2026 Meta charges for replies and, without a card in
// its Billing Hub, delivers only the first 1,000 of each month.
function BillingBanner({ problem, isOwner }: { problem: BillingProblem; isOwner: boolean }) {
  const messages = problem.count === 1 ? "1 mensaje" : `${problem.count} mensajes`;
  return (
    <div role="alert" className="rounded-2xl border border-danger-border bg-danger-tint p-4 lg:p-5">
      <h2 className="font-heading text-[15px] font-semibold text-danger">
        WhatsApp no está entregando tus respuestas por un problema de pago con Meta
      </h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink">
        {messages} no se entregaron en los últimos días (el último {relativeTime(problem.lastAt)}). Meta cobra las
        respuestas a tus clientes y, sin una tarjeta, solo entrega las primeras 1,000 del mes.
      </p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink">
        {isOwner
          ? "Para arreglarlo: abre Billing Hub con la cuenta de Facebook que conectó WhatsApp, agrega una tarjeta en «Métodos de pago» y vuelve a enviar los mensajes que fallaron."
          : "Avísale al dueño del negocio: debe agregar una tarjeta en Billing Hub de Meta."}
      </p>
      <a
        href={META_BILLING_HUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex h-10 items-center rounded-[10px] bg-danger px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        Abrir Billing Hub de Meta
      </a>
    </div>
  );
}

// Number shared with the WhatsApp Business app on the phone: shows how the
// one-time import of the phone's chats is going, and lets the owner retry it
// if Meta didn't accept it (only possible in the first 24 hours).
function CoexistenceStatus({
  channel,
  isOwner,
  busy,
  onRetry,
}: {
  channel: ChannelItem;
  isOwner: boolean;
  busy: boolean;
  onRetry: (id: string) => void;
}) {
  // Read the clock once per mount, not on every render.
  const [now] = useState(() => Date.now());
  const requested = Boolean(channel.contacts_sync_requested_at && channel.history_sync_requested_at);
  const withinWindow =
    !channel.connected_at || now - new Date(channel.connected_at).getTime() < COEXISTENCE_SYNC_WINDOW_MS;
  const progress = channel.history_sync_progress;

  let text: string;
  if (channel.history_sync_error === "declined") text = "Elegiste no compartir tu historial de chats; los mensajes nuevos sí llegan a cheke.";
  else if (channel.history_sync_error) text = `No se pudo importar tu historial: ${channel.history_sync_error}`;
  else if (!requested) text = withinWindow ? "Tus chats todavía no se han importado." : "Ya no se pueden importar tus chats anteriores (pasaron 24 horas).";
  else if (progress === null) text = "Importando tus chats de los últimos 6 meses… deja la app de WhatsApp Business abierta en tu teléfono.";
  else if (progress < 100) text = `Importando tus chats… ${progress}%`;
  else text = "Chats de los últimos 6 meses importados.";

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
      <p>
        <strong className="text-ink">También en tu teléfono:</strong> sigues usando WhatsApp Business en la app, y lo
        que respondas ahí aparece aquí. {text}
      </p>
      {isOwner && !requested && withinWindow && !channel.history_sync_error && (
        <button
          onClick={() => onRetry(channel.id)}
          disabled={busy}
          className="h-8 self-start rounded-[8px] bg-brand px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Importar chats
        </button>
      )}
    </div>
  );
}
