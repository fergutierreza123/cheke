"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatLempiras } from "@/lib/format";
import { recipientValues } from "@/lib/broadcasts";
import {
  renderTemplate,
  suggestedValues,
  templateCategoryLabel,
  templateDisplayName,
  templateVariables,
  variableLabel,
  type WhatsAppTemplate,
} from "@/lib/whatsappTemplates";
import { TemplateText } from "@/components/TemplateText";
import { cancelBroadcast, createBroadcast, previewBroadcast, type BroadcastPreview } from "./actions";

// Plantillas → Campañas (`broadcasts` in code): pick a number, Etiquetas and an approved template,
// see who gets it and what it costs, send. /api/cron/broadcasts sends it in
// parts; the list below shows how it's going.

export type BroadcastTemplate = WhatsAppTemplate & { channel_id: string };
export type BroadcastRow = {
  id: string;
  name: string;
  tags: string[];
  status: string;
  created_at: string;
  sent: number;
  failed: number;
  waiting: number;
  cancelled: number;
  // Left "sending" by a run that died; marked failed, never resent.
  interrupted: number;
};

const STATUS_LABEL: Record<string, string> = { done: "Terminada", cancelled: "Cancelada", sending: "Enviando…" };

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";
const label = "text-[12.5px] font-semibold text-ink";

export function BroadcastView({
  businessName,
  channels,
  templates,
  tags,
  history,
}: {
  businessName: string;
  channels: Array<{ id: string; label: string }>;
  templates: BroadcastTemplate[];
  tags: string[];
  history: BroadcastRow[];
}) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [nameVariable, setNameVariable] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [previewed, setPreviewed] = useState<{ key: string; preview: BroadcastPreview | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [cancelling, startCancelling] = useTransition();

  const numberTemplates = useMemo(() => templates.filter((t) => t.channel_id === channelId), [templates, channelId]);
  const template = numberTemplates.find((t) => t.id === templateId) ?? null;
  const variables = template ? templateVariables(template) : [];

  function pickTemplate(id: string) {
    setTemplateId(id);
    setValues({});
    setConsent(false);
    const t = templates.find((x) => x.id === id);
    // The variable that clearly holds the customer's name starts as "their name".
    setNameVariable(t ? (Object.keys(suggestedValues(t, "Ana"))[0] ?? null) : null);
  }

  // The preview follows every change of number, template or Etiquetas.
  // Kept with the choices it was made for, so an old one never shows.
  const previewKey = channelId && templateId && picked.length ? `${channelId}|${templateId}|${picked.join(",")}` : "";
  const preview = previewed?.key === previewKey ? previewed.preview : null;
  useEffect(() => {
    if (!previewKey) return;
    let live = true;
    previewBroadcast({ channelId, templateId, tags: picked }).then((r) => {
      if (!live) return;
      setPreviewed({ key: previewKey, preview: r.preview ?? null });
      setError(r.error ?? null);
    });
    return () => {
      live = false;
    };
  }, [previewKey, channelId, templateId, picked]);

  // Refresh the progress while a Campaña is still going out.
  const going = history.some((b) => b.status === "sending");
  useEffect(() => {
    if (!going) return;
    const timer = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(timer);
  }, [going, router]);

  function send() {
    setError(null);
    startSending(async () => {
      const r = await createBroadcast({ channelId, templateId, tags: picked, values, nameVariable, consent });
      if (r.error) {
        setError(r.error);
        return;
      }
      setDone(`Listo: la campaña va para ${r.count} clientes. Se envía por partes; mira el avance abajo.`);
      setPicked([]);
      setTemplateId("");
      setValues({});
      setConsent(false);
      router.refresh();
    });
  }

  function cancel(id: string) {
    if (!window.confirm("¿Cancelar la campaña? Los clientes que ya la recibieron no cambian; el resto ya no la recibe.")) return;
    setError(null);
    startCancelling(async () => {
      const r = await cancelBroadcast(id);
      if (r.error) setError(r.error);
      router.refresh();
    });
  }

  const sample = template ? renderTemplate(template, recipientValues(values, nameVariable, "María")) : "";
  const canSend = Boolean(preview && preview.count > 0 && (!preview.marketing || consent)) && !sending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-4 py-4 lg:px-8 lg:py-[18px]">
        <Link href="/templates" className="-my-2.5 inline-block py-2.5 pr-4 text-[12.5px] text-ink-muted hover:text-ink">
          ‹ Plantillas
        </Link>
        <h1 className="font-heading text-xl font-semibold text-ink">Campañas</h1>
        <p className="text-[13.5px] text-ink-muted">
          Envía una plantilla aprobada a todos los clientes con una etiqueta.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 lg:px-8">
        <div className="flex max-w-[640px] flex-col gap-4">
          {channels.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-ink-muted">
              Conecta un número de WhatsApp en Canales para enviar campañas.
            </p>
          ) : (
            <>
              {channels.length > 1 && (
                <label className="flex flex-col gap-1.5">
                  <span className={label}>Número de WhatsApp</span>
                  <select value={channelId} onChange={(e) => {
                      setChannelId(e.target.value);
                      pickTemplate("");
                    }} className={field}>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <fieldset className="flex flex-col gap-1.5">
                <legend className={`${label} mb-1.5`}>¿A quiénes? Clientes con la etiqueta…</legend>
                {tags.length === 0 ? (
                  <p className="text-[13px] text-ink-muted">
                    Todavía no hay etiquetas. Ponle etiquetas a tus clientes en{" "}
                    <Link href="/contacts" className="font-semibold text-brand">
                      Contactos
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => {
                      const on = picked.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setPicked(on ? picked.filter((x) => x !== t) : [...picked, t])}
                          className="chip min-h-10 lg:min-h-0"
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                )}
              </fieldset>

              <label className="flex flex-col gap-1.5">
                <span className={label}>Plantilla aprobada</span>
                <select value={templateId} onChange={(e) => pickTemplate(e.target.value)} className={field}>
                  <option value="">Elige una plantilla</option>
                  {numberTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {templateDisplayName(t.name)} · {templateCategoryLabel(t.category)}
                    </option>
                  ))}
                </select>
                {numberTemplates.length === 0 && (
                  <span className="text-[12.5px] text-ink-muted">
                    Este número no tiene plantillas aprobadas. Envía una a aprobación desde Plantillas.
                  </span>
                )}
              </label>

              {variables.map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <span className={label}>{variableLabel(key)}</span>
                  <label className="flex items-center gap-2 text-[13px] text-ink">
                    <input
                      type="checkbox"
                      checked={nameVariable === key}
                      onChange={(e) => setNameVariable(e.target.checked ? key : null)}
                    />
                    Poner el nombre de cada cliente
                  </label>
                  <input
                    value={values[key] ?? ""}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    placeholder={nameVariable === key ? "Si no tenemos su nombre, poner… (ej. amigo)" : "Escribe el dato"}
                    className={field}
                  />
                </div>
              ))}

              {template && (
                <div className="rounded-[14px] bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
                  <TemplateText text={sample} />
                </div>
              )}

              {preview && (
                <div className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-4 py-3 text-[13.5px] text-ink">
                  <p className="font-semibold">
                    La reciben {preview.count} {preview.count === 1 ? "cliente" : "clientes"}
                  </p>
                  {preview.noPhone + preview.optedOut + preview.usNumbers > 0 && (
                    <p className="text-[12.5px] text-ink-muted">
                      No se envía a {[
                        preview.noPhone && `${preview.noPhone} sin teléfono`,
                        preview.optedOut && `${preview.optedOut} que pidieron no recibir ofertas`,
                        preview.usNumbers && `${preview.usNumbers} con número de EE. UU. (WhatsApp no les entrega promociones)`,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      .
                    </p>
                  )}
                  <p>
                    Costo aproximado que cobra WhatsApp: <b>US${preview.usd.toFixed(2)}</b> ({formatLempiras(preview.hnl)})
                  </p>
                  {preview.count > preview.roomToday && (
                    <p className="text-[12.5px] font-semibold text-danger">
                      WhatsApp te deja escribir a {preview.roomToday} clientes más en estas 24 horas: hoy se envían{" "}
                      {preview.roomToday} y el resto en los días siguientes.
                    </p>
                  )}
                </div>
              )}

              {preview?.marketing && (
                <label className="flex items-start gap-2 text-[13px] text-ink">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                  <span>
                    Confirmo que mis clientes aceptaron recibir ofertas de {businessName}. Si alguien responde «BAJA», cheke
                    no le vuelve a enviar campañas.
                  </span>
                </label>
              )}

              {error && <p className="text-[13px] text-danger">{error}</p>}
              {done && <p className="text-[13px] font-semibold text-brand-dark">{done}</p>}

              <button
                type="button"
                disabled={!canSend}
                onClick={send}
                className="h-11 rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-40"
              >
                {sending ? "Enviando…" : preview?.count ? `Enviar a ${preview.count} clientes` : "Enviar"}
              </button>
            </>
          )}

          {history.length > 0 && (
            <section className="mt-4 flex flex-col gap-2">
              <h2 className="font-heading text-[15.5px] font-semibold text-brand-dark">Campañas recientes</h2>
              {history.map((b) => (
                <div key={b.id} className="rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-ink">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{templateDisplayName(b.name)}</span>
                    <span className={b.status === "sending" ? "font-semibold text-brand" : "text-ink-muted"}>
                      {STATUS_LABEL[b.status] ?? b.status}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-ink-muted">
                    {new Date(b.created_at).toLocaleDateString("es-HN", { day: "numeric", month: "short" })} · {b.tags.join(", ")}
                  </p>
                  <p className="mt-1">
                    {b.sent} enviados
                    {b.waiting > 0 && ` · ${b.waiting} por enviar`}
                    {b.failed > 0 && ` · ${b.failed} no se pudieron enviar`}
                    {b.cancelled > 0 && ` · ${b.cancelled} cancelados`}
                  </p>
                  {b.interrupted > 0 && (
                    <p className="text-[12.5px] text-ink-muted">
                      {b.interrupted} se interrumpieron al enviarse. No se reenvían para no mandar el mensaje dos veces.
                    </p>
                  )}
                  {b.status === "sending" && (
                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={() => cancel(b.id)}
                      className="mt-1 min-h-10 text-[13px] font-semibold text-danger disabled:opacity-40"
                    >
                      Cancelar campaña
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
