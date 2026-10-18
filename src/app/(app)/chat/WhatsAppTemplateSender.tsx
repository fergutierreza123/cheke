"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  listWhatsAppTemplates,
  refreshWhatsAppTemplates,
  sendWhatsAppTemplate,
  type ChatWhatsAppTemplate,
} from "./templateActions";
import {
  renderTemplate,
  suggestedValues,
  templateProblem,
  templateVariables,
  validateTemplateValues,
} from "@/lib/whatsappTemplates";
import { DEMO_WHATSAPP_TEMPLATES } from "@/lib/demoData";
import type { Message } from "@/lib/types";

// "Enviar plantilla": shown in place of the composer's blocked notice when a
// WhatsApp chat's 24 h window has closed. Pick an approved template, fill its
// {{1}}… data, see exactly what the customer will read, send. Kept in its
// own file so the composer itself stays untouched.

const CATEGORY_LABEL: Record<string, string> = {
  UTILITY: "Utilidad",
  MARKETING: "Promoción",
  AUTHENTICATION: "Código",
};

// "seguimiento_pedido" → "Seguimiento pedido"
function displayName(name: string): string {
  const text = name.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The few words before a variable, so each field says what it's for
// ("Hola {{1}}" → "Hola …").
function variableContext(body: string, key: string): string | null {
  const at = body.indexOf(`{{${key}}}`);
  if (at <= 0) return null;
  const words = body
    .slice(0, at)
    .replace(/\{\{[^}]+\}\}/g, "…")
    .trim()
    .split(/\s+/)
    .slice(-3)
    .join(" ");
  return words ? `${words} …` : null;
}

export function WhatsAppTemplateSender({
  conversationId,
  contactName,
  demo = false,
  onSent,
}: {
  conversationId: string;
  contactName: string | null | undefined;
  // The public /demo: sample templates, nothing leaves the browser.
  demo?: boolean;
  onSent: (result: { message?: Message; error?: string; sendError?: string }) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<ChatWhatsAppTemplate[] | null>(demo ? DEMO_WHATSAPP_TEMPLATES : null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ChatWhatsAppTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // First open: what cheke has; if it has nothing yet, ask Meta once.
  useEffect(() => {
    if (!open || templates !== null || demo) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let result = await listWhatsAppTemplates(conversationId);
        if (!result.error && result.templates.length === 0) result = await refreshWhatsAppTemplates(conversationId);
        if (cancelled) return;
        setTemplates(result.templates);
        setListError(result.error ?? null);
      } catch {
        if (!cancelled) setListError("No se pudieron cargar las plantillas. Revisa tu conexión.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, templates, demo, conversationId]);

  async function handleRefresh() {
    if (demo) return;
    setRefreshing(true);
    setListError(null);
    try {
      const result = await refreshWhatsAppTemplates(conversationId);
      setTemplates(result.templates);
      setListError(result.error ?? null);
      // The picked one may have changed (paused, edited, gone).
      if (picked) setPicked(result.templates.find((t) => t.id === picked.id) ?? null);
    } catch {
      setListError("No se pudo actualizar. Revisa tu conexión.");
    } finally {
      setRefreshing(false);
    }
  }

  function pick(t: ChatWhatsAppTemplate) {
    setPicked(t);
    setValues(suggestedValues(t, contactName));
    setFormError(null);
  }

  const variables = useMemo(() => (picked ? templateVariables(picked) : []), [picked]);
  const body = picked?.components.find((c) => c.type?.toUpperCase() === "BODY")?.text ?? "";
  const preview = picked ? renderTemplate(picked, values) : "";

  async function handleSend() {
    if (!picked) return;
    const invalid = validateTemplateValues(picked, values);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      if (demo) {
        onSent({
          message: {
            id: `demo-tpl-${Date.now()}`,
            conversation_id: conversationId,
            business_id: "demo",
            direction: "out",
            body: preview,
            media_url: null,
            status: "sent",
            is_bot: false,
            created_at: new Date().toISOString(),
          },
        });
      } else {
        const result = await sendWhatsAppTemplate(conversationId, picked.id, values);
        if (result.error && !result.message) {
          setFormError(result.error);
          return;
        }
        onSent(result);
      }
      setOpen(false);
      setPicked(null);
    } catch {
      setFormError("No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  }

  const sendable = (templates ?? []).filter((t) => !templateProblem(t));
  const others = (templates ?? []).filter((t) => templateProblem(t));

  return (
    <div className="shrink-0 border-t border-border bg-surface-2">
      <div className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
        <ClockIcon className="h-4 w-4 shrink-0 text-ink-soft" />
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-muted">
          Pasaron más de 24 horas desde su último mensaje. WhatsApp solo deja escribirle con una plantilla aprobada.
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-h-9 shrink-0 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {open ? "Cerrar" : "Enviar plantilla"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
            className="overflow-hidden"
          >
            <div className="max-h-[min(60dvh,460px)] overflow-y-auto border-t border-border bg-surface px-4 py-3 lg:px-6">
              {picked ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPicked(null)}
                      className="-ml-1 flex min-h-8 items-center gap-1 rounded-md px-1 text-[12.5px] font-semibold text-brand-dark hover:bg-surface-2"
                    >
                      <span aria-hidden>‹</span> Plantillas
                    </button>
                    <span className="text-[11.5px] text-ink-soft">{CATEGORY_LABEL[picked.category] ?? picked.category}</span>
                  </div>
                  <div className="font-heading text-[15px] font-semibold text-ink">{displayName(picked.name)}</div>

                  {variables.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {variables.map((key) => {
                        const context = variableContext(body, key);
                        return (
                          <label key={key} className="flex flex-col gap-1">
                            <span className="text-[11.5px] text-ink-muted">
                              Dato <span className="font-heading text-brand-dark">{`{{${key}}}`}</span>
                              {context && <span className="text-ink-soft"> · {context}</span>}
                            </span>
                            <input
                              value={values[key] ?? ""}
                              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                              maxLength={200}
                              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13.5px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <div className="mb-1.5 text-[11.5px] text-ink-muted">Así lo verá el cliente</div>
                    <div className="rounded-[10px] bg-[#EFEAE2] p-3">
                      <div className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-[7.5px] rounded-tr-none bg-[#D9FDD3] px-3 py-2 text-[13.5px] leading-[19px] text-[#111B21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                        {preview}
                      </div>
                    </div>
                  </div>

                  {formError && (
                    <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-[12.5px] text-danger">
                      {formError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending}
                    className="min-h-11 rounded-[10px] bg-brand text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {sending ? "Enviando…" : "Enviar plantilla"}
                  </button>
                  <p className="text-[11.5px] leading-snug text-ink-soft">
                    Si el cliente responde, puedes volver a escribirle normal por 24 horas. WhatsApp cobra cada plantilla a tu
                    cuenta de Meta.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12.5px] font-semibold text-ink">Plantillas aprobadas por WhatsApp</div>
                    {!demo && (
                      <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={refreshing || loading}
                        className="flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold text-brand-dark hover:bg-surface-2 disabled:opacity-60"
                      >
                        <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        {refreshing ? "Actualizando…" : "Actualizar"}
                      </button>
                    )}
                  </div>

                  {listError && <p className="rounded-lg bg-danger-tint px-3 py-2 text-[12.5px] text-danger">{listError}</p>}

                  {loading || templates === null ? (
                    <div className="py-6 text-center text-[12.5px] text-ink-soft">Buscando tus plantillas en WhatsApp…</div>
                  ) : sendable.length === 0 ? (
                    <div className="rounded-[10px] bg-surface-2 px-3 py-3 text-[12.5px] leading-snug text-ink-muted">
                      Todavía no tienes plantillas aprobadas. Crea una en{" "}
                      <Link href="/templates" className="font-semibold text-brand-dark underline underline-offset-2">
                        Plantillas
                      </Link>{" "}
                      con «Enviar a aprobación de WhatsApp». WhatsApp suele revisarla en minutos, a veces hasta un día.
                    </div>
                  ) : null}

                  {!loading && templates !== null && (
                    <ul className="flex flex-col gap-1.5">
                      {[...sendable, ...others].map((t) => {
                        const problem = templateProblem(t);
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => pick(t)}
                              disabled={Boolean(problem)}
                              className="flex w-full flex-col gap-0.5 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70"
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-[13px] font-semibold text-ink">{displayName(t.name)}</span>
                                <span className="shrink-0 rounded-md bg-brand-tint px-1.5 py-0.5 text-[10.5px] font-bold text-brand-dark">
                                  {CATEGORY_LABEL[t.category] ?? t.category}
                                </span>
                              </span>
                              <span className="line-clamp-2 text-[12px] leading-snug text-ink-muted">{renderTemplate(t, {})}</span>
                              {problem && <span className="text-[11.5px] text-ink-soft">{problem}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
