"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { submitTemplateForApproval, type TemplateApproval } from "./whatsappActions";
import {
  NEW_TEMPLATE_CATEGORIES,
  rejectedReasonText,
  savedReplyToMetaBody,
  templateSlug,
  templateStatusLabel,
  validateNewTemplate,
  type NewTemplateCategory,
} from "@/lib/whatsappTemplates";
import type { Template } from "@/lib/types";
import { ChannelIcon } from "@/components/ChannelIcon";

// Plantillas → "Enviar a aprobación de WhatsApp" (migration 0033). A saved
// reply becomes a WhatsApp template Meta reviews; once approved, Chat can
// send it after the 24 h window closes.

export type WhatsAppChannelOption = { id: string; label: string };

const CATEGORY_COPY: Record<NewTemplateCategory, { title: string; hint: string }> = {
  UTILITY: {
    title: "Utilidad",
    hint: "Sobre algo que el cliente ya pidió o compró: su pedido, envío, pago o cita. Es la más barata.",
  },
  MARKETING: {
    title: "Promoción",
    hint: "Ofertas, novedades, descuentos o invitar a comprar. WhatsApp la cobra más cara.",
  },
};

// Examples Meta needs for each {{n}}, guessed from cheke's variable names.
const EXAMPLES: Record<string, string> = {
  nombre: "Ana",
  producto: "blusa de lino",
  precio: "L 450",
  ciudad: "Tegucigalpa",
};

// "WhatsApp: Aprobada" under a Plantilla, with Meta's reason when rejected.
export function WhatsAppStatus({ approval }: { approval: TemplateApproval }) {
  const status = approval.status.toUpperCase();
  const tone =
    status === "APPROVED"
      ? "bg-accent-tint text-brand-dark"
      : status === "REJECTED" || status === "DISABLED" || status === "PAUSED"
        ? "bg-danger-tint text-danger"
        : "bg-surface-2 text-ink-muted";
  const reason = status === "REJECTED" ? rejectedReasonText(approval.rejected_reason) : null;
  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex w-max items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
        <ChannelIcon type="whatsapp" className="h-3 w-3" />
        WhatsApp: {templateStatusLabel(status)}
      </span>
      {status === "PENDING" && (
        <span className="text-[11.5px] leading-snug text-ink-soft">Suele tardar minutos, a veces hasta un día.</span>
      )}
      {reason && <span className="text-[11.5px] leading-snug text-danger">{reason}</span>}
    </div>
  );
}

export function WhatsAppApprovalDialog({
  template,
  channels,
  demo = false,
  onClose,
  onSubmitted,
}: {
  template: Template | null;
  channels: WhatsAppChannelOption[];
  demo?: boolean;
  onClose: () => void;
  onSubmitted: (approval: TemplateApproval) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {template && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-10 bg-black/45 backdrop-blur-sm"
          />
          <motion.div
            key="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-approval-title"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
            className="fixed left-1/2 top-1/2 z-20 max-h-[calc(100dvh-32px)] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] bg-surface p-5 shadow-[0_24px_64px_rgba(0,16,55,0.35)] lg:p-7"
          >
            <ApprovalForm
              key={template.id}
              template={template}
              channels={channels}
              demo={demo}
              onClose={onClose}
              onSubmitted={onSubmitted}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ApprovalForm({
  template,
  channels,
  demo,
  onClose,
  onSubmitted,
}: {
  template: Template;
  channels: WhatsAppChannelOption[];
  demo: boolean;
  onClose: () => void;
  onSubmitted: (approval: TemplateApproval) => void;
}) {
  const converted = useMemo(() => savedReplyToMetaBody(template.body), [template.body]);
  const [name, setName] = useState(templateSlug(template.name));
  const [category, setCategory] = useState<NewTemplateCategory>(
    template.category === "bienvenida" || template.category === "seguimiento" ? "MARKETING" : "UTILITY",
  );
  const [body, setBody] = useState(converted.text);
  const [examples, setExamples] = useState<string[]>(converted.variables.map((v) => EXAMPLES[v] ?? ""));
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // {{1}}, {{2}}… as they are in the message right now.
  const slots = useMemo(() => {
    const seen: number[] = [];
    for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
      const n = Number(m[1]);
      if (!seen.includes(n)) seen.push(n);
    }
    return seen.sort((a, b) => a - b);
  }, [body]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const request = { name: templateSlug(name), category, body, examples: slots.map((n) => examples[n - 1] ?? "") };
    const invalid = validateNewTemplate(request);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!channelId && !demo) {
      setError("Conecta WhatsApp en Canales antes de enviar plantillas a aprobación.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (demo) {
        onSubmitted({
          id: `demo-${template.id}`,
          channel_id: "ch1",
          source_template_id: template.id,
          name: request.name,
          status: "PENDING",
          category,
          rejected_reason: null,
        });
        return;
      }
      const result = await submitTemplateForApproval({ sourceTemplateId: template.id, channelId, ...request });
      if (result.error || !result.approval) setError(result.error ?? "WhatsApp no aceptó la plantilla.");
      else onSubmitted(result.approval);
    } catch {
      setError("No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div id="wa-approval-title" className="font-heading text-lg font-semibold text-ink">
            Enviar a aprobación de WhatsApp
          </div>
          <p className="mt-1 max-w-[52ch] text-[12.5px] leading-snug text-ink-muted">
            Con una plantilla aprobada puedes escribirle a un cliente aunque hayan pasado más de 24 horas desde su
            último mensaje.
          </p>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <Field label="Tipo de mensaje">
        <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {NEW_TEMPLATE_CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setCategory(cat)}
                className={`flex flex-col gap-1 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                  active ? "border-brand bg-brand-tint" : "border-border bg-surface hover:bg-surface-2"
                }`}
              >
                <span className={`text-[13px] font-semibold ${active ? "text-brand-dark" : "text-ink"}`}>
                  {CATEGORY_COPY[cat].title}
                </span>
                <span className="text-[11.5px] leading-snug text-ink-muted">{CATEGORY_COPY[cat].hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">
          Si dudas, elige Utilidad. Si WhatsApp cree que es promoción, la cambia o la rechaza.
        </p>
      </Field>

      <Field label="Mensaje">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1024}
          className="min-h-[110px] w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
        />
        <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">
          Los datos que cambian van como {"{{1}}"}, {"{{2}}"}… y se llenan al enviar desde el Chat. No pueden ir al
          inicio ni al final del mensaje.
        </p>
      </Field>

      {slots.length > 0 && (
        <Field label="Ejemplos para la revisión">
          <div className="flex flex-col gap-2">
            {slots.map((n) => (
              <label key={n} className="flex items-center gap-2">
                <span className="w-10 shrink-0 font-heading text-[12.5px] text-brand-dark">{`{{${n}}}`}</span>
                <input
                  value={examples[n - 1] ?? ""}
                  onChange={(e) =>
                    setExamples((prev) => {
                      const next = [...prev];
                      next[n - 1] = e.target.value;
                      return next;
                    })
                  }
                  placeholder="Ej. Ana"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13.5px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">WhatsApp los usa solo para revisar la plantilla.</p>
        </Field>
      )}

      <Field label="Nombre en WhatsApp">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setName(templateSlug(name))}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 font-heading text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
        />
      </Field>

      {channels.length > 1 && (
        <Field label="Número de WhatsApp">
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-[10px] bg-surface-2 py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-3"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-[10px] bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Enviando…" : "Enviar a aprobación"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] uppercase tracking-wide text-ink-muted">{label}</div>
      {children}
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

