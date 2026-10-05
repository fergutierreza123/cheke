"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { saveContact } from "./actions";
import { seedDemoData } from "../actions";
import { initialsFor, relativeTime, primaryChannel, CHANNEL_META } from "@/lib/format";
import { ChannelIcon } from "@/components/ChannelIcon";
import type { Contact } from "@/lib/types";

type Draft = {
  id: string | null;
  name: string;
  phone: string;
  ig_handle: string;
  fb_id: string;
  notes: string;
};

const EMPTY_DRAFT: Draft = { id: null, name: "", phone: "", ig_handle: "", fb_id: "", notes: "" };

export function ContactsView({ contacts }: { contacts: Contact[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.phone, c.ig_handle, c.fb_id].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [contacts, query]);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  async function handleSave(formData: FormData) {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveContact(formData);
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      setDraft(null);
    } finally {
      setSaving(false);
    }
  }

  function openDraft(d: Draft) {
    setSaveError(null);
    setDraft(d);
  }

  function closeDraft() {
    setSaveError(null);
    setDraft(null);
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDemoData();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-surface px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-[18px]">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">Contactos</h1>
          <p className="hidden text-[13.5px] text-ink-muted sm:block">
            Registro de datos de todos tus clientes, sin importar el canal por el que llegaron
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-0 flex-1 lg:flex-none">
            <SearchIcon className="pointer-events-none absolute left-[11px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, teléfono o usuario"
              className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-3 text-[13.5px] lg:w-64 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </div>
          <button
            onClick={() => openDraft(EMPTY_DRAFT)}
            className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 lg:py-2"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nuevo contacto</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 px-4 pt-3.5 pb-1 lg:px-8">
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="font-heading text-lg font-bold text-ink">{contacts.length}</div>
          <div className="text-xs text-ink-muted">contactos registrados</div>
        </div>
        <div className="ml-auto text-xs text-ink-soft">{filtered.length} resultado(s)</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3 lg:px-8">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-[13.5px] text-ink-muted">
              Todavía no tienes contactos. Puedes crear uno, o sembrar datos de ejemplo para probar la app.
            </p>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="rounded-lg bg-brand-dark px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {seeding ? "Sembrando…" : "Sembrar datos de ejemplo"}
            </button>
          </div>
        ) : (
          <>
            <div className="hidden items-center px-3.5 pb-2 text-[11.5px] uppercase tracking-wide text-ink-soft lg:flex">
              <div className="w-[220px]">Cliente</div>
              <div className="w-[160px]">Contacto</div>
              <div className="flex-1">Notas</div>
              <div className="w-28 text-right">Registrado</div>
            </div>
            <div className="flex flex-col gap-2">
              {filtered.map((c) => {
                const channel = primaryChannel(c);
                const meta = channel ? CHANNEL_META[channel] : null;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="flex items-center rounded-xl border border-border bg-surface px-3.5 py-[11px] text-left transition-colors hover:bg-surface-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:w-[220px] lg:flex-none">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white">
                        {initialsFor(c.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold text-ink">{c.name}</div>
                        {meta && channel && (
                          <div className="flex items-center gap-1.5">
                            <ChannelIcon type={channel} className="h-3 w-3 shrink-0 rounded-full" />
                            <span className="truncate text-[11.5px] text-ink-muted">
                              {meta.label}
                              <span className="lg:hidden"> · {c.phone || c.ig_handle || c.fb_id || "—"}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="hidden w-40 truncate text-[13px] text-ink-muted lg:block">
                      {c.phone || c.ig_handle || c.fb_id || "—"}
                    </div>
                    <div className="hidden flex-1 truncate text-[13px] text-ink-soft lg:block">{c.notes || ""}</div>
                    <div className="shrink-0 pl-2 text-right text-xs text-ink-soft lg:w-28">
                      {relativeTime(c.created_at)}
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-10 text-center text-[13.5px] text-ink-soft">
                  Ningún contacto coincide con esa búsqueda.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && !draft && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setSelectedId(null)}
              className="fixed inset-0 z-10 bg-black/30"
            />
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
              transition={
                prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }
              }
              className="fixed right-0 top-0 z-20 flex h-full w-full flex-col sm:w-[380px] gap-5 overflow-y-auto bg-surface p-6 shadow-[-12px_0_32px_rgba(0,0,0,0.14)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
                    {initialsFor(selected.name)}
                  </div>
                  <div>
                    <div className="font-heading text-[17px] font-semibold text-ink">{selected.name}</div>
                    <div className="text-[13px] text-ink-muted">
                      {selected.phone || selected.ig_handle || selected.fb_id || "Sin datos de contacto"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    aria-label="Editar contacto"
                    onClick={() =>
                      openDraft({
                        id: selected.id,
                        name: selected.name,
                        phone: selected.phone ?? "",
                        ig_handle: selected.ig_handle ?? "",
                        fb_id: selected.fb_id ?? "",
                        notes: selected.notes ?? "",
                      })
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-brand-dark"
                  >
                    <EditIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    aria-label="Cerrar"
                    onClick={() => setSelectedId(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-ink-muted"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 rounded-[10px] bg-surface-2 px-3.5 py-3">
                <Row label="Teléfono" value={selected.phone || "Sin registrar"} />
                <Row label="Instagram" value={selected.ig_handle || "Sin registrar"} />
                <Row label="Facebook" value={selected.fb_id || "Sin registrar"} />
                <Row label="Cliente desde" value={relativeTime(selected.created_at)} />
              </div>

              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-muted">Notas</div>
                <div className="rounded-[10px] bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink">
                  {selected.notes || "Sin notas todavía."}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create/edit modal */}
      <AnimatePresence>
        {draft && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => closeDraft()}
              className="fixed inset-0 z-10 bg-black/45 backdrop-blur-sm"
            />
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              transition={
                prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }
              }
              className="fixed left-1/2 top-1/2 z-20 max-h-[calc(100dvh-32px)] w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] bg-surface p-5 lg:p-7 shadow-[0_24px_64px_rgba(0,16,55,0.35)]"
            >
              <form action={handleSave} className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="font-heading text-lg font-semibold text-ink">
                    {draft.id ? "Editar contacto" : "Nuevo contacto"}
                  </div>
                  <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={() => closeDraft()}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-ink-muted"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                {draft.id && <input type="hidden" name="id" value={draft.id} />}

                <Field label="Nombre">
                  <input
                    name="name"
                    defaultValue={draft.name}
                    placeholder="Nombre completo"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Teléfono (WhatsApp)">
                    <input
                      name="phone"
                      defaultValue={draft.phone}
                      placeholder="+504 0000-0000"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                    />
                  </Field>
                  <Field label="Instagram">
                    <input
                      name="ig_handle"
                      defaultValue={draft.ig_handle}
                      placeholder="@usuario"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                    />
                  </Field>
                </div>

                <Field label="Facebook">
                  <input
                    name="fb_id"
                    defaultValue={draft.fb_id}
                    placeholder="usuario.facebook"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                  />
                </Field>

                <Field label="Notas">
                  <textarea
                    name="notes"
                    defaultValue={draft.notes}
                    placeholder="Preferencias, historial, detalles útiles…"
                    className="min-h-[100px] w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                  />
                </Field>

                {saveError && (
                  <div className="rounded-lg border border-danger-border bg-danger-tint px-3 py-2.5 text-[12.5px] text-danger">
                    {saveError}
                  </div>
                )}

                <div className="mt-1 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => closeDraft()}
                    className="flex-1 rounded-[10px] bg-surface-2 py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-3"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-[10px] bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Guardar contacto"}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
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
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
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
