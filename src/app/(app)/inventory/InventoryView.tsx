"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { saveProduct } from "./actions";
import { sendProductToConversation } from "../actions";
import { initialsFor, formatLempiras, CHANNEL_META } from "@/lib/format";
import type { ConversationWithContact, Product } from "@/lib/types";

const LOW_STOCK_THRESHOLD = 3;

const TILE_PALETTE = [
  { bg: "var(--color-brand-tint)", text: "var(--color-brand-dark)" },
  { bg: "var(--color-accent-tint)", text: "var(--color-brand-dark)" },
  { bg: "rgba(0,16,55,0.08)", text: "var(--color-brand-dark)" },
  { bg: "var(--color-surface-3)", text: "var(--color-ink-muted)" },
];

type Draft = {
  id: string | null;
  name: string;
  category: string;
  price: string;
  stock: string;
  visible: boolean;
  imageUrl: string | null;
};
const EMPTY_DRAFT: Draft = { id: null, name: "", category: "", price: "", stock: "", visible: true, imageUrl: null };

export function InventoryView({
  products,
  conversations,
}: {
  products: Product[];
  conversations: ConversationWithContact[];
}) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendMenuId, setSendMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // A freshly-picked file's local preview — separate from draft.imageUrl
  // (the already-saved photo), reset every time the modal opens or closes
  // so a cancelled pick never bleeds into the next product.
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  function openDraft(d: Draft) {
    setNewImagePreview(null);
    setDraft(d);
  }

  function closeDraft() {
    setNewImagePreview(null);
    setDraft(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q),
    );
  }, [products, query]);

  const totalValue = products.reduce((sum, p) => sum + p.price_hnl * p.stock, 0);
  const lowStockCount = products.filter((p) => p.stock <= LOW_STOCK_THRESHOLD).length;

  async function handleSave(formData: FormData) {
    setSaving(true);
    try {
      const result = await saveProduct(formData);
      if (!result.error) {
        setToast(
          draft?.id
            ? `Cambios guardados para "${draft.name}".`
            : `Producto "${formData.get("name")}" agregado al catálogo.`,
        );
        closeDraft();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(product: Product, conversation: ConversationWithContact) {
    setSendMenuId(null);
    const result = await sendProductToConversation(conversation.id, product);
    if (result.error) {
      setToast(`No se pudo enviar: ${result.error}`);
    } else {
      setToast(`Enviaste "${product.name}" a ${conversation.contact.name}.`);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-8 py-[18px]">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">Catálogo</h1>
          <p className="text-[13.5px] text-ink-muted">
            Productos, fotos y precios, listos para enviar directo al chat cuando pregunten
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-[11px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto"
              className="w-56 rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-3 text-[13.5px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </div>
          <button
            onClick={() => openDraft(EMPTY_DRAFT)}
            className="flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Nuevo producto
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 px-8 pb-1 pt-3.5">
        <StatCard value={String(products.length)} label="productos en catálogo" />
        <StatCard value={formatLempiras(totalValue)} label="valor total en existencia" />
        <StatCard value={String(lowStockCount)} label="con poco inventario" danger={lowStockCount > 0} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6 pt-4">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-[13.5px] text-ink-muted">Todavía no tienes productos en tu catálogo.</p>
            <button
              onClick={() => openDraft(EMPTY_DRAFT)}
              className="mt-1 rounded-lg bg-brand-dark px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Agregar el primer producto
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3.5">
            {filtered.map((p, idx) => {
              const tile = TILE_PALETTE[idx % TILE_PALETTE.length];
              const lowStock = p.stock <= LOW_STOCK_THRESHOLD;
              return (
                <div key={p.id} className="flex w-[236px] flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
                  <div
                    style={p.image_url ? undefined : { background: tile.bg }}
                    className="relative flex h-[120px] items-center justify-center overflow-hidden"
                  >
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL, not a local/optimizable asset
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <span style={{ color: tile.text }} className="font-heading text-3xl font-bold">
                        {initialsFor(p.name)}
                      </span>
                    )}
                    {lowStock && (
                      <div className="absolute right-2 top-2 rounded-md bg-danger px-2 py-[3px] text-[10.5px] font-bold text-white">
                        Poco stock
                      </div>
                    )}
                    {!p.visible && (
                      <div className="absolute left-2 top-2 rounded-md bg-ink/70 px-2 py-[3px] text-[10.5px] font-bold text-white">
                        Oculto
                      </div>
                    )}
                    <button
                      onClick={() =>
                        openDraft({
                          id: p.id,
                          name: p.name,
                          category: p.category ?? "",
                          price: String(p.price_hnl),
                          stock: String(p.stock),
                          visible: p.visible,
                          imageUrl: p.image_url,
                        })
                      }
                      aria-label="Editar producto"
                      className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-[7px] bg-white/85 text-brand-dark"
                    >
                      <EditIcon className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                    {p.category && (
                      <div className="text-[11px] uppercase tracking-wide text-ink-soft">{p.category}</div>
                    )}
                    <div className="text-[13.5px] font-semibold leading-tight text-ink">{p.name}</div>
                    <div className="mt-0.5 flex items-baseline justify-between">
                      <div className="font-heading text-[17px] font-bold text-brand-dark">
                        {formatLempiras(p.price_hnl)}
                      </div>
                      <div className="text-[11.5px] text-ink-muted">{p.stock} en stock</div>
                    </div>
                    <div className="relative mt-1.5">
                      <button
                        onClick={() => setSendMenuId(sendMenuId === p.id ? null : p.id)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-dark px-2 py-2 text-[12.5px] font-semibold text-white"
                      >
                        <SendIcon className="h-3 w-3" />
                        Enviar por chat
                      </button>
                      <AnimatePresence>
                        {sendMenuId === p.id && (
                          <motion.div
                            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                            transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                            className="absolute bottom-[42px] left-0 right-0 z-10 rounded-[10px] border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,16,55,0.14)]"
                          >
                            <div className="px-2 py-1 text-[11px] text-ink-soft">Enviar a…</div>
                            <div className="max-h-40 overflow-y-auto">
                              {conversations.length === 0 && (
                                <div className="px-2 py-1.5 text-[12.5px] text-ink-soft">
                                  No hay conversaciones todavía.
                                </div>
                              )}
                              {conversations.map((c) => {
                                const meta = c.channel ? CHANNEL_META[c.channel.type] : null;
                                return (
                                  <button
                                    key={c.id}
                                    onClick={() => handleSend(p, c)}
                                    className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left hover:bg-surface-2"
                                  >
                                    {meta && (
                                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                                    )}
                                    <span className="truncate text-[12.5px] text-ink">{c.contact.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="w-full py-10 text-center text-[13.5px] text-ink-soft">
                Ningún producto coincide con esa búsqueda.
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
              onClick={() => closeDraft()}
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
                    {draft.id ? "Editar producto" : "Nuevo producto"}
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
                <input type="hidden" name="existingImageUrl" value={draft.imageUrl ?? ""} />

                <Field label="Foto del producto">
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                      {newImagePreview || draft.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local blob preview or remote Supabase Storage URL
                        <img
                          src={newImagePreview ?? draft.imageUrl ?? undefined}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PhotoIcon className="h-5 w-5 text-ink-soft" />
                      )}
                    </div>
                    <input
                      name="image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setNewImagePreview(file ? URL.createObjectURL(file) : null);
                      }}
                      className="flex-1 text-[12.5px] text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-ink hover:file:bg-surface-3"
                    />
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nombre">
                    <input
                      name="name"
                      required
                      defaultValue={draft.name}
                      placeholder="Nombre del producto"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                    />
                  </Field>
                  <Field label="Categoría">
                    <input
                      name="category"
                      defaultValue={draft.category}
                      placeholder="Vestidos, bolsos, calzado…"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                    />
                  </Field>
                  <Field label="Precio (Lempiras)">
                    <input
                      name="price"
                      type="number"
                      min={0}
                      defaultValue={draft.price}
                      placeholder="0"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                    />
                  </Field>
                  <Field label="Stock disponible">
                    <input
                      name="stock"
                      type="number"
                      min={0}
                      defaultValue={draft.stock}
                      placeholder="0"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                    />
                  </Field>
                </div>

                <label className="flex items-center gap-2.5 text-sm text-ink">
                  <input type="checkbox" name="visible" defaultChecked={draft.visible} className="h-4 w-4 rounded border-border accent-brand" />
                  Visible para clientes
                </label>

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
                    className="flex-[2] rounded-[10px] bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Guardar producto"}
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
            <div className="text-[13px] leading-relaxed">{toast}</div>
            <button onClick={() => setToast(null)} aria-label="Cerrar" className="ml-1 shrink-0 text-[#A9B1CC]">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ value, label, danger }: { value: string; label: string; danger?: boolean }) {
  return (
    <div className="flex-1 rounded-xl border border-border bg-surface px-4 py-3">
      <div className={`font-heading text-lg font-bold ${danger ? "text-danger" : "text-ink"}`}>{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
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
function PhotoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5.5-5.5a2 2 0 0 0-2.83 0L5 18" />
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
function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
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
