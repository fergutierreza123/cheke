"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChannelIcon } from "@/components/ChannelIcon";
import { relativeTime } from "@/lib/format";
import type { ChannelType } from "@/lib/types";
import { ConnectWhatsAppButton } from "./ConnectWhatsAppButton";
import { ConnectMetaButton } from "./ConnectMetaButton";
import { disconnectChannel, retryCoexistenceSync } from "./actions";
import { disconnectMetaPage } from "./metaActions";
import { COEXISTENCE_SYNC_WINDOW_MS } from "@/lib/coexistence";
import { BrandMark } from "@/components/BrandMark";

export type ChannelItem = {
  id: string;
  type: ChannelType;
  status: "disconnected" | "connected" | "error";
  external_id: string | null;
  page_id: string | null;
  display_phone: string | null;
  verified_name: string | null;
  connected_at: string | null;
  coexistence: boolean;
  contacts_sync_requested_at: string | null;
  history_sync_requested_at: string | null;
  history_sync_progress: number | null;
  history_sync_error: string | null;
};

export function ChannelsView({
  channels,
  isOwner,
  meta,
  messaging,
}: {
  channels: ChannelItem[];
  isOwner: boolean;
  // null until Meta's app + Embedded Signup are configured on the server
  meta: { appId: string; configId: string } | null;
  // null until the Instagram + Facebook login configuration is set up
  messaging: { appId: string; configId: string } | null;
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

          <MetaChannelsCard channels={channels} isOwner={isOwner} messaging={messaging} />
        </div>
      </div>
    </div>
  );
}

// Instagram DMs + Facebook Messenger: one card, since both connect together
// through a Facebook Page (and the Instagram account linked to it). A
// business can connect more than one Page.
function MetaChannelsCard({
  channels,
  isOwner,
  messaging,
}: {
  channels: ChannelItem[];
  isOwner: boolean;
  messaging: { appId: string; configId: string } | null;
}) {
  const router = useRouter();
  const [busyPage, setBusyPage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = channels.filter(
    (c) => (c.type === "facebook" || c.type === "instagram") && c.status === "connected" && c.page_id,
  );
  const pageIds = Array.from(new Set(connected.map((c) => c.page_id as string)));
  const pages = pageIds.map((pageId) => ({
    pageId,
    facebook: connected.find((c) => c.page_id === pageId && c.type === "facebook"),
    instagram: connected.find((c) => c.page_id === pageId && c.type === "instagram"),
  }));

  async function handleDisconnect(pageId: string) {
    const ok = window.confirm(
      "¿Desconectar esta página? Dejarás de recibir y enviar sus mensajes de Facebook e Instagram desde cheke.",
    );
    if (!ok) return;
    setBusyPage(pageId);
    setError(null);
    const result = await disconnectMetaPage(pageId);
    setBusyPage(null);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 -space-x-2">
          <ChannelIcon type="instagram" className="h-10 w-10 rounded-full ring-2 ring-surface" />
          <ChannelIcon type="facebook" className="h-10 w-10 rounded-full ring-2 ring-surface" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-[15.5px] font-semibold text-ink">Instagram y Facebook</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                pages.length > 0 ? "bg-accent-tint text-brand-dark" : "bg-surface-2 text-ink-muted"
              }`}
            >
              {pages.length > 0 ? "Conectado" : "Sin conectar"}
            </span>
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
            Los mensajes directos de Instagram y de Messenger llegan al mismo buzón que WhatsApp. Necesitas una página
            de Facebook; si tu Instagram profesional está vinculado a ella, se conecta junto.
          </p>
        </div>
      </div>

      {pages.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {pages.map((p) => (
            <li key={p.pageId} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
              <div className="min-w-0 flex-1 text-[13px] text-ink-muted">
                <div className="flex items-center gap-1.5">
                  <ChannelIcon type="facebook" className="h-4 w-4 shrink-0 rounded-full" />
                  <strong className="truncate text-ink">{p.facebook?.verified_name ?? "Página de Facebook"}</strong>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <ChannelIcon type="instagram" className="h-4 w-4 shrink-0 rounded-full" />
                  <span className="truncate">
                    {p.instagram ? (p.instagram.verified_name ?? "Instagram") : "Sin Instagram vinculado"}
                  </span>
                </div>
                {p.facebook?.connected_at && (
                  <div className="mt-1 text-[12px] text-ink-soft">Conectado {relativeTime(p.facebook.connected_at)}</div>
                )}
              </div>
              {isOwner && (
                <button
                  onClick={() => handleDisconnect(p.pageId)}
                  disabled={busyPage !== null}
                  className="h-9 rounded-[10px] border border-danger-border bg-danger-tint px-3 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
                >
                  {busyPage === p.pageId ? "Desconectando…" : "Desconectar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {!isOwner ? (
          <p className="text-[12.5px] text-ink-soft">Solo el dueño del negocio puede conectar o desconectar canales.</p>
        ) : messaging ? (
          <ConnectMetaButton
            appId={messaging.appId}
            configId={messaging.configId}
            label={pages.length > 0 ? "Conectar otra página" : undefined}
          />
        ) : (
          <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
            La conexión con Instagram y Facebook se activa cuando Meta apruebe los permisos de cheke. Mientras tanto
            puedes probar chekelin con el modo prueba del Chat.
          </div>
        )}
        {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
      </div>
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
