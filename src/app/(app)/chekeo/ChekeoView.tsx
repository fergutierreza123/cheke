"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { setConversationStage, setConversationValue, createLead } from "../actions";
import { ChannelIcon } from "@/components/ChannelIcon";
import {
  initialsFor,
  relativeTime,
  CHANNEL_META,
  STAGE_META,
  STAGE_ORDER,
  formatLempiras,
} from "@/lib/format";
import type { ConversationStage, ConversationWithContact } from "@/lib/types";

const STALE_MS = 24 * 60 * 60 * 1000;

function isStale(c: ConversationWithContact): boolean {
  if (c.stage === "ganado" || c.stage === "perdido") return false;
  if (!c.last_message_at) return false;
  return Date.now() - new Date(c.last_message_at).getTime() > STALE_MS;
}

type Draft = { name: string; phone: string; ig_handle: string; fb_id: string };
const EMPTY_DRAFT: Draft = { name: "", phone: "", ig_handle: "", fb_id: "" };

export function ChekeoView({ conversations: initialConversations }: { conversations: ConversationWithContact[] }) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ConversationStage | null>(null);
  // The card that just changed stage — pinned to the top of its new column
  // and given a brief glow, so it's obvious where it landed instead of
  // disappearing into wherever it'd normally sort. Clears itself after the
  // highlight fades.
  const [justMovedId, setJustMovedId] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  // Phones show one scrolling list instead of side-by-side columns: all
  // stages stacked, or just the one picked in the chip bar.
  const [mobileStage, setMobileStage] = useState<ConversationStage | "todos">("todos");

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  function updateLocal(id: string, patch: Partial<ConversationWithContact>) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function handleSetStage(id: string, stage: ConversationStage) {
    updateLocal(id, { stage });
    setJustMovedId(id);
    window.setTimeout(() => {
      setJustMovedId((current) => (current === id ? null : current));
    }, 2000);
    await setConversationStage(id, stage);
  }

  function openNewLead() {
    setLeadError(null);
    setDraft(EMPTY_DRAFT);
  }

  async function handleSetValue(id: string, raw: string) {
    const trimmed = raw.trim();
    const value = trimmed ? Number(trimmed) : null;
    if (value !== null && Number.isNaN(value)) return;
    updateLocal(id, { value_hnl: value });
    await setConversationValue(id, value);
  }

  const columns = useMemo(() => {
    return STAGE_ORDER.map((stage) => {
      const items = conversations
        .filter((c) => c.stage === stage)
        .sort((a, b) => {
          // Whatever card just moved goes straight to the top of its new
          // column — it's where the user is already looking, so the drop
          // never has to be found by scanning.
          if (a.id === justMovedId) return -1;
          if (b.id === justMovedId) return 1;
          return (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "");
        });
      const total = items.reduce((sum, c) => sum + (c.value_hnl ?? 0), 0);
      return { stage, items, total };
    });
  }, [conversations, justMovedId]);

  const activeConversations = conversations.filter((c) => c.stage !== "ganado" && c.stage !== "perdido");
  const wonCount = conversations.filter((c) => c.stage === "ganado").length;
  const lostCount = conversations.filter((c) => c.stage === "perdido").length;
  const totalPipelineValue = activeConversations.reduce((sum, c) => sum + (c.value_hnl ?? 0), 0);
  const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;
  const staleCount = activeConversations.filter(isStale).length;

  async function handleSaveLead(formData: FormData) {
    setSaving(true);
    setLeadError(null);
    try {
      const result = await createLead({
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? "").trim() || null,
        ig_handle: String(formData.get("ig_handle") ?? "").trim() || null,
        fb_id: String(formData.get("fb_id") ?? "").trim() || null,
      });
      if (result.conversation) {
        setConversations((prev) => [result.conversation!, ...prev]);
        setDraft(null);
      } else if (result.error) {
        setLeadError(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col max-lg:overflow-y-auto">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-surface px-4 py-3.5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:px-8 lg:py-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold text-ink">Chekeo de ventas</h1>
            <p className="hidden text-[13.5px] text-ink-muted lg:block">
              Arrastra una tarjeta o usa las flechas para mover un contacto de etapa
            </p>
          </div>
          <button
            onClick={openNewLead}
            aria-label="Nuevo contacto"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] bg-brand px-3.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 lg:hidden"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Nuevo
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex lg:items-center lg:gap-2.5">
          <StatPill value={String(activeConversations.length)} label="activas" />
          <StatPill value={formatLempiras(totalPipelineValue)} label="en negociación" />
          <StatPill value={`${winRate}%`} label="tasa de cierre" />
          <button
            onClick={openNewLead}
            className="ml-1 hidden items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 lg:flex"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Nuevo contacto
          </button>
        </div>
      </div>

      {staleCount > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-[10px] border border-danger-border bg-danger-tint px-3 py-2 lg:mx-8 lg:mt-4 lg:px-3.5 lg:py-2.5">
          <WarningIcon className="h-4 w-4 shrink-0 text-danger" />
          <div className="text-[13.5px] text-danger">
            <strong>{staleCount} contacto{staleCount === 1 ? "" : "s"}</strong> lleva
            {staleCount === 1 ? "" : "n"} más de un día sin respuesta<span className="hidden lg:inline"> — revísalos antes de que se enfríen</span>.
          </div>
        </div>
      )}

            {/* Phones: a pipeline you scroll like a feed. A chip bar shows every stage
          with its count (tap one to focus it), and cards sit in one vertical
          list grouped by stage — no sideways paging through six columns. */}
      <div className="flex shrink-0 flex-col lg:hidden">
        <div className="sticky top-0 z-[5] flex h-[60px] shrink-0 items-center gap-2 overflow-x-auto bg-bg px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <StageChip active={mobileStage === "todos"} onClick={() => setMobileStage("todos")} label="Todos" count={conversations.length} />
          {columns.map(({ stage, items }) => (
            <StageChip
              key={stage}
              active={mobileStage === stage}
              onClick={() => setMobileStage(stage)}
              label={STAGE_META[stage].label}
              count={items.length}
              color={STAGE_META[stage].color}
            />
          ))}
        </div>
        <div className="px-4 pb-4">
          {columns
            .filter(({ stage }) => mobileStage === "todos" || mobileStage === stage)
            .map(({ stage, items, total }) => {
              const meta = STAGE_META[stage];
              // Empty stages are skipped in the combined view (they'd just be
              // noise) but still show their empty message when focused.
              if (mobileStage === "todos" && items.length === 0) return null;
              return (
                <section key={stage} className="mb-4">
                  <div className="sticky top-[60px] z-[4] -mx-4 flex items-center gap-2 bg-bg px-4 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                    <h2 className="flex-1 font-heading text-[14.5px] font-semibold text-ink">{meta.label}</h2>
                    <span className="text-xs text-ink-muted">{total ? formatLempiras(total) : ""}</span>
                    <span className="rounded-full bg-surface px-2 py-px text-[13px] font-semibold text-ink-muted">{items.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((c) => (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(c.id)}
                        onKeyDown={(e) => e.key === "Enter" && setSelectedId(c.id)}
                        style={{
                          boxShadow:
                            c.id === justMovedId
                              ? `0 0 0 2px ${meta.color}, 0 2px 8px ${meta.color}55`
                              : "0 1px 2px rgba(34,29,23,0.05)",
                        }}
                        className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-3 transition-shadow duration-300"
                      >
                        <LeadCardContent c={c} onMove={handleSetStage} compact />
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div className="rounded-[10px] border border-dashed border-border py-8 text-center text-[12.5px] text-ink-soft">
                        Sin contactos aquí
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          {conversations.length === 0 && (
            <div className="py-10 text-center text-[13.5px] text-ink-soft">Todavía no hay contactos en el Chekeo.</div>
          )}
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-8 py-4 lg:block">
        <div className="flex h-full items-start gap-4">
          {columns.map(({ stage, items, total }) => {
            const meta = STAGE_META[stage];
            const isDropTarget = dragOverStage === stage && draggingId;
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStage !== stage) setDragOverStage(stage);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingId) handleSetStage(draggingId, stage);
                  setDraggingId(null);
                  setDragOverStage(null);
                }}
                style={{
                  background: isDropTarget ? `${meta.color}22` : `${meta.color}14`,
                  // inset, not a regular ring — a regular box-shadow is
                  // drawn outside the border box, which this column's own
                  // height (exactly matching its scroll-container parent)
                  // was clipping on the top/bottom edges, making the
                  // highlight look cut off instead of wrapping the shape.
                  boxShadow: isDropTarget ? `inset 0 0 0 2px ${meta.color}` : "inset 0 0 0 2px transparent",
                }}
                className="flex h-full w-[246px] min-w-[246px] max-w-[246px] shrink-0 flex-col rounded-[14px] p-3 transition-[background-color,box-shadow] duration-150"
              >
                <div className="flex items-center gap-2 px-1 pb-0.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                  <div className="flex-1 font-heading text-[14.5px] font-semibold text-ink">{meta.label}</div>
                  <div className="rounded-full bg-surface px-2 py-px text-[13px] font-semibold text-ink-muted">
                    {items.length}
                  </div>
                </div>
                <div className="px-1 pb-2.5 text-xs text-ink-muted">
                  {total ? `${formatLempiras(total)} en esta etapa` : "Sin valor asignado"}
                </div>

                {/* A scrolling box clips anything drawn outside its edge, which
                    cut the "just moved" ring/glow off on the top and right of
                    a card. Padding gives that ring room to draw, and the
                    matching negative margin cancels it out so the cards
                    don't actually shift. */}
                <div className="-m-2.5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
                  {items.map((c) => {
                    const justMoved = c.id === justMovedId;
                    return (
                      <motion.div
                        key={c.id}
                        layoutId={c.id}
                        layout
                        draggable
                        // `layout` makes motion.div claim onDragStart/onDragEnd for its
                        // own (unrelated) drag gesture system, with an incompatible
                        // event type. We're using native HTML5 DnD instead, so hook the
                        // capture-phase variants — untyped by motion — to get the real
                        // DragEvent with `dataTransfer`.
                        onDragStartCapture={(e: React.DragEvent<HTMLDivElement>) => {
                          e.dataTransfer.setData("text/plain", c.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(c.id);
                        }}
                        onDragEndCapture={() => {
                          setDraggingId(null);
                          setDragOverStage(null);
                        }}
                        onClick={() => setSelectedId(c.id)}
                        transition={
                          prefersReducedMotion
                            ? { duration: 0.01 }
                            : { type: "spring", bounce: 0.2, duration: 0.5 }
                        }
                        style={{
                          opacity: draggingId === c.id ? 0.4 : 1,
                          // Use Motion's own scale/rotate style shorthands
                          // (not a raw `transform` string) so they compose
                          // correctly with the transform `layout` applies
                          // for the FLIP flight animation instead of
                          // fighting it.
                          scale: draggingId === c.id ? 0.96 : 1,
                          rotate: draggingId === c.id ? -2 : 0,
                          boxShadow: justMoved
                            ? `0 0 0 2px ${STAGE_META[c.stage].color}, 0 2px 8px ${STAGE_META[c.stage].color}55`
                            : "0 1px 2px rgba(34,29,23,0.05)",
                        }}
                        className="flex cursor-grab flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-[11px] transition-[opacity,box-shadow] duration-300 active:cursor-grabbing"
                      >
                        <LeadCardContent c={c} onMove={handleSetStage} />
                      </motion.div>
                    );
                  })}
                  {items.length === 0 && !isDropTarget && (
                    <div className="flex min-h-14 flex-1 items-center justify-center rounded-[10px] text-center text-[12.5px] text-ink-soft">
                      Sin contactos aquí
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lead detail drawer */}
      <AnimatePresence>
        {selected && (
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
              transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
              className="fixed right-0 top-0 z-20 flex h-full w-full flex-col sm:w-[380px] sm:max-w-[calc(100vw-32px)] gap-5 overflow-y-auto bg-surface p-6 shadow-[-12px_0_32px_rgba(0,0,0,0.14)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
                    {initialsFor(selected.contact.name)}
                  </div>
                  <div>
                    <div className="font-heading text-[17px] font-semibold text-ink">{selected.contact.name}</div>
                    <div className="text-[13.5px] text-ink-muted">
                      {selected.contact.phone || selected.contact.ig_handle || selected.contact.fb_id}
                    </div>
                  </div>
                </div>
                <button
                  aria-label="Cerrar"
                  onClick={() => setSelectedId(null)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              <div>
                <div className="mb-1.5 text-xs uppercase tracking-wide text-ink-muted">Valor del negocio</div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">L</span>
                  <input
                    key={selected.id}
                    type="number"
                    defaultValue={selected.value_hnl ?? ""}
                    placeholder="0"
                    onBlur={(e) => handleSetValue(selected.id, e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-7 pr-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                  />
                </div>
              </div>

              {selected.last_message_body && (
                <div>
                  <div className="mb-1.5 text-xs uppercase tracking-wide text-ink-muted">Último mensaje</div>
                  <div className="rounded-[10px] rounded-bl-sm bg-surface-2 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink">
                    {selected.last_message_body}
                  </div>
                  <div className="mt-1 text-[11.5px] text-ink-soft">{relativeTime(selected.last_message_at)}</div>
                </div>
              )}

              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-ink-muted">Etapa</div>
                <div className="flex flex-col gap-1.5">
                  {STAGE_ORDER.map((s) => {
                    const meta = STAGE_META[s];
                    const active = selected.stage === s;
                    return (
                      <button
                        key={s}
                        onClick={() => handleSetStage(selected.id, s)}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] transition-colors ${
                          active
                            ? "border-ink-soft bg-surface-2 font-semibold text-ink"
                            : "border-border bg-surface text-ink-muted hover:bg-surface-2"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Link
                href={`/chat?c=${selected.id}`}
                className="flex items-center justify-center gap-2 rounded-[10px] bg-brand-dark py-2.5 text-[13.5px] font-semibold text-white"
              >
                Abrir en Chat
              </Link>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* New lead drawer */}
      <AnimatePresence>
        {draft && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => {
                setLeadError(null);
                setDraft(null);
              }}
              className="fixed inset-0 z-10 bg-black/45 backdrop-blur-sm"
            />
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
              className="fixed left-1/2 top-1/2 z-20 max-h-[calc(100dvh-32px)] w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] bg-surface p-5 lg:p-7 shadow-[0_24px_64px_rgba(0,16,55,0.35)]"
            >
              <form action={handleSaveLead} className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="font-heading text-lg font-semibold text-ink">Nuevo contacto</div>
                  <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={() => {
                      setLeadError(null);
                      setDraft(null);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-ink-muted"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                <Field label="Nombre">
                  <input
                    name="name"
                    placeholder="Nombre completo"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Teléfono (WhatsApp)">
                    <input
                      name="phone"
                      placeholder="+504 0000-0000"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                    />
                  </Field>
                  <Field label="Instagram">
                    <input
                      name="ig_handle"
                      placeholder="@usuario"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                    />
                  </Field>
                </div>
                <Field label="Facebook">
                  <input
                    name="fb_id"
                    placeholder="usuario.facebook"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                  />
                </Field>

                {leadError && (
                  <div className="rounded-lg border border-danger-border bg-danger-tint px-3 py-2.5 text-[12.5px] text-danger">
                    {leadError}
                  </div>
                )}

                <div className="mt-1 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setLeadError(null);
                      setDraft(null);
                    }}
                    className="flex-1 rounded-[10px] bg-surface-2 py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-3"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-[10px] bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Guardando…" : "Agregar al Chekeo"}
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

// The inside of a lead card, shared by the desktop kanban card (draggable
// wrapper) and the phone list card (tap-to-open wrapper). `compact` is the
// phone layout: three tight rows instead of five.
function LeadCardContent({
  c,
  onMove,
  compact = false,
}: {
  c: ConversationWithContact;
  onMove: (id: string, stage: ConversationStage) => void;
  compact?: boolean;
}) {
  const channelMeta = c.channel ? CHANNEL_META[c.channel.type] : null;
  const stageIdx = STAGE_ORDER.indexOf(c.stage);

  const avatar = (
    <div className="relative h-7 w-7 shrink-0 rounded-full bg-brand text-[12.5px] font-bold text-white">
      <span className="flex h-full w-full items-center justify-center">{initialsFor(c.contact.name)}</span>
      {c.channel && (
        <ChannelIcon
          type={c.channel.type}
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-surface"
        />
      )}
    </div>
  );
  const arrowClass =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink-muted lg:h-[22px] lg:w-[22px] lg:rounded-md";
  const arrows = (
    <div className="flex justify-end gap-1">
      {stageIdx > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMove(c.id, STAGE_ORDER[stageIdx - 1]);
          }}
          aria-label="Mover a etapa anterior"
          className={arrowClass}
        >
          <ChevronLeftIcon className="h-3.5 w-3.5 lg:h-3 lg:w-3" />
        </button>
      )}
      {stageIdx < STAGE_ORDER.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMove(c.id, STAGE_ORDER[stageIdx + 1]);
          }}
          aria-label="Mover a siguiente etapa"
          className={arrowClass}
        >
          <ChevronRightIcon className="h-3.5 w-3.5 lg:h-3 lg:w-3" />
        </button>
      )}
    </div>
  );
  const valueBadge = c.value_hnl ? (
    <div className="rounded-md bg-brand-tint px-1.5 py-0.5 text-xs font-bold text-brand-dark">
      {formatLempiras(c.value_hnl)}
    </div>
  ) : null;
  const staleBadge = isStale(c) ? (
    <div className="flex w-fit items-center gap-1 rounded-md bg-danger-tint px-1.5 py-1 text-[11.5px] font-semibold text-danger">
      <WarningIcon className="h-2.5 w-2.5" />
      Requiere seguimiento
    </div>
  ) : null;

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-2.5">
          {avatar}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-ink">{c.contact.name}</div>
            {channelMeta && <div className="truncate text-xs text-ink-muted">{channelMeta.label}</div>}
          </div>
          <div className="shrink-0 self-start text-[11px] text-ink-soft">{relativeTime(c.last_message_at)}</div>
        </div>
        <div className="truncate text-[13px] text-ink-muted">{c.last_message_body ?? ""}</div>
        <div className="flex items-center gap-2">
          {valueBadge}
          {staleBadge}
          <div className="ml-auto">{arrows}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-ink">{c.contact.name}</div>
          {channelMeta && <div className="truncate text-xs text-ink-muted">{channelMeta.label}</div>}
        </div>
      </div>
      <div className="truncate text-[13px] text-ink-muted">{c.last_message_body ?? ""}</div>
      <div className="flex items-center justify-between">
        {valueBadge ?? <span />}
        <div className="ml-auto text-[11px] text-ink-soft">{relativeTime(c.last_message_at)}</div>
      </div>
      {staleBadge}
      {arrows}
    </>
  );
}

function StageChip({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors ${
        active ? "border-brand-dark bg-brand-dark text-white" : "border-border bg-surface text-ink-muted"
      }`}
    >
      {color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      {label}
      <span className={`text-xs ${active ? "text-white/70" : "text-ink-soft"}`}>{count}</span>
    </button>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[10px] bg-surface-2 px-2 py-[5px] text-center lg:min-w-[96px] lg:px-3.5 lg:py-[7px]">
      <div className="font-heading text-base font-bold text-ink">{value}</div>
      <div className="text-[11px] text-ink-muted">{label}</div>
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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
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
