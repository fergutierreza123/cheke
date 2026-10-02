"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { saveTemplate } from "./actions";
import { TEMPLATE_CATEGORY_META, TEMPLATE_CATEGORY_ORDER } from "@/lib/format";
import type { Template, TemplateCategory } from "@/lib/types";

type Draft = { id: string | null; name: string; category: TemplateCategory; body: string };
const EMPTY_DRAFT: Draft = { id: null, name: "", category: "precios", body: "" };

export function TemplatesView({ templates }: { templates: Template[] }) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | "todas">("todas");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      const matchesCategory = categoryFilter === "todas" || t.category === categoryFilter;
      const matchesQuery = !q || t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [templates, query, categoryFilter]);

  async function handleSave(formData: FormData) {
    setSaving(true);
    try {
      const result = await saveTemplate(formData);
      if (!result.error) {
        setToast(draft?.id ? `Cambios guardados en "${draft.name}".` : `Plantilla "${formData.get("name")}" creada.`);
        setDraft(null);
      } else {
        setToast(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy(t: Template) {
    try {
      await navigator.clipboard.writeText(t.body);
      setToast(`Plantilla "${t.name}" copiada — pégala en cualquier conversación.`);
    } catch {
      setToast("No se pudo copiar — selecciona y copia el texto manualmente.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-8 py-[18px]">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">Plantillas</h1>
          <p className="text-[13.5px] text-ink-muted">
            Respuestas listas para las preguntas que se repiten todos los días
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-[11px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar plantilla"
              className="w-56 rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-3 text-[13.5px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </div>
          <button
            onClick={() => setDraft(EMPTY_DRAFT)}
            className="flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Nueva plantilla
          </button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-4 px-8 pb-1 pt-3.5">
        <div className="flex flex-wrap gap-1.5">
          <CategoryChip active={categoryFilter === "todas"} onClick={() => setCategoryFilter("todas")}>
            Todas
          </CategoryChip>
          {TEMPLATE_CATEGORY_ORDER.map((cat) => (
            <CategoryChip key={cat} active={categoryFilter === cat} onClick={() => setCategoryFilter(cat)}>
              {TEMPLATE_CATEGORY_META[cat].label}
            </CategoryChip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          Variables disponibles:
          <VarTag>{"{{producto}}"}</VarTag>
          <VarTag>{"{{precio}}"}</VarTag>
          <VarTag>{"{{ciudad}}"}</VarTag>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6 pt-4">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-[13.5px] text-ink-muted">Todavía no tienes plantillas guardadas.</p>
            <button
              onClick={() => setDraft(EMPTY_DRAFT)}
              className="mt-1 rounded-lg bg-brand-dark px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Crear la primera plantilla
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3.5">
            {filtered.map((t) => {
              const meta = TEMPLATE_CATEGORY_META[t.category];
              return (
                <div key={t.id} className="flex w-[328px] flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-ink">{t.name}</div>
                      <div className="mt-1 inline-block rounded-md bg-brand-tint px-2 py-0.5 text-[10.5px] font-bold text-brand-dark">
                        {meta.label}
                      </div>
                    </div>
                    <button
                      onClick={() => setDraft({ id: t.id, name: t.name, category: t.category, body: t.body })}
                      aria-label="Editar plantilla"
                      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-surface-2 text-brand-dark"
                    >
                      <EditIcon className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex-1 rounded-[10px] bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                    {t.body}
                  </div>
                  <button
                    onClick={() => handleCopy(t)}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-dark px-2 py-2 text-xs font-semibold text-white"
                  >
                    <CopyIcon className="h-3 w-3" />
                    Copiar plantilla
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="w-full py-10 text-center text-[13px] text-ink-soft">
                No hay plantillas con estos filtros.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/edit modal */}
      <AnimatePresence>
        {draft && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setDraft(null)}
              className="fixed inset-0 z-10 bg-black/45 backdrop-blur-sm"
            />
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
              className="fixed left-1/2 top-1/2 z-20 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[18px] bg-surface p-7 shadow-[0_24px_64px_rgba(0,16,55,0.35)]"
            >
              <form action={handleSave} className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="font-heading text-lg font-semibold text-ink">
                    {draft.id ? "Editar plantilla" : "Nueva plantilla"}
                  </div>
                  <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={() => setDraft(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-ink-muted"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                {draft.id && <input type="hidden" name="id" value={draft.id} />}

                <Field label="Nombre de la plantilla">
                  <input
                    name="name"
                    defaultValue={draft.name}
                    placeholder="Ej. Precio con envío"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                  />
                </Field>

                <Field label="Categoría">
                  <CategoryPicker name="category" defaultValue={draft.category} />
                </Field>

                <Field label="Mensaje — usa {{producto}}, {{precio}} o {{ciudad}} para que las rellenes al copiar">
                  <textarea
                    name="body"
                    defaultValue={draft.body}
                    placeholder="Escribe el mensaje que quieres reutilizar…"
                    className="min-h-[130px] w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                  />
                </Field>

                <div className="mt-1 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="flex-1 rounded-[10px] bg-surface-2 py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-3"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] rounded-[10px] bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Guardar plantilla"}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="fixed bottom-6 left-1/2 z-30 flex max-w-[460px] -translate-x-1/2 items-center gap-2.5 rounded-xl bg-brand-dark px-4.5 py-3 text-white shadow-[0_12px_32px_rgba(0,16,55,0.3)]"
          >
            <CheckIcon className="h-4 w-4 shrink-0 text-accent" />
            <div className="text-[12.5px] leading-relaxed">{toast}</div>
            <button onClick={() => setToast(null)} aria-label="Cerrar" className="ml-1 shrink-0 text-[#A9B1CC]">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoryPicker({ name, defaultValue }: { name: string; defaultValue: TemplateCategory }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="flex gap-1.5">
      <input type="hidden" name={name} value={value} />
      {TEMPLATE_CATEGORY_ORDER.map((cat) => {
        const active = value === cat;
        const meta = TEMPLATE_CATEGORY_META[cat];
        return (
          <button
            key={cat}
            type="button"
            onClick={() => setValue(cat)}
            className={`flex-1 rounded-lg border px-1 py-2 text-[11.5px] font-semibold transition-colors ${
              active ? "border-brand bg-brand-tint text-brand-dark" : "border-border bg-surface text-ink-muted hover:bg-surface-2"
            }`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-[5px] text-xs font-semibold transition-colors ${
        active ? "border-brand-dark bg-brand-dark text-white" : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
      }`}
    >
      {children}
    </button>
  );
}

function VarTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-heading text-brand-dark">{children}</span>
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
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
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
