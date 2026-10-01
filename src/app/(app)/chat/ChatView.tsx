"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { seedDemoData, setConversationStage, setConversationBotEnabled } from "../actions";
import { sendChatMessage, simulateInboundMessage } from "./actions";
import { initialsFor, relativeTime, CHANNEL_META, STAGE_META, STAGE_ORDER, withAlpha } from "@/lib/format";
import type { ChannelType, ConversationStage, ConversationWithContact, Message } from "@/lib/types";

const CHANNEL_FILTERS: Array<{ id: ChannelType | "todos"; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
];

const LIST_WIDTH_KEY = "cheke-chat-list-width";
const LIST_WIDTH_MIN = 240;
const LIST_WIDTH_MAX = 460;
const LIST_WIDTH_DEFAULT = 320;

export function ChatView({
  businessId,
  conversations: initialConversations,
  initialSelectedId,
  initialMessages,
}: {
  businessId: string;
  conversations: ConversationWithContact[];
  initialSelectedId: string | null;
  initialMessages: Message[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>(
    initialSelectedId ? { [initialSelectedId]: initialMessages } : {},
  );
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelType | "todos">("todos");
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  // Demo/testing only — lets you type as if you were the customer so
  // Chekelin's first-reply flow can be shown without a real WhatsApp number
  // connected yet.
  const [simulateMode, setSimulateMode] = useState(false);
  const [botTyping, setBotTyping] = useState(false);
  const [listWidth, setListWidth] = useState(LIST_WIDTH_DEFAULT);
  const resizing = useRef(false);
  // Below the `lg` breakpoint there isn't room for list + thread side by
  // side, so only one shows at a time. Default to the thread so the already
  // selected conversation is visible immediately, with no tap required.
  const [mobileView, setMobileView] = useState<"list" | "thread">("thread");
  const [showDetail, setShowDetail] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Restore the panel width the viewer left it at last time (per-browser
  // convenience only — never shared state, so it's fine in localStorage).
  // Read after mount rather than as a lazy initial state so the server-
  // rendered markup and the first client render match (no hydration diff).
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(LIST_WIDTH_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external store (localStorage) on mount, not derived from React state
      if (saved) setListWidth(Math.min(LIST_WIDTH_MAX, Math.max(LIST_WIDTH_MIN, saved)));
    } catch {
      // ignore — private browsing, blocked storage, etc.
    }
  }, []);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = listWidth;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    function onMove(ev: MouseEvent) {
      if (!resizing.current) return;
      setListWidth(Math.min(LIST_WIDTH_MAX, Math.max(LIST_WIDTH_MIN, startWidth + (ev.clientX - startX))));
    }
    function onUp() {
      resizing.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setListWidth((w) => {
        try {
          localStorage.setItem(LIST_WIDTH_KEY, String(w));
        } catch {
          // ignore
        }
        return w;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  // Falls back to "nuevo" if the `stage` migration hasn't run yet on this
  // database — avoids a hard crash on old rows missing the column.
  const selectedStage = selected?.stage ?? "nuevo";
  const messages = selectedId ? (messagesByConversation[selectedId] ?? []) : [];

  function appendMessage(msg: Message) {
    setMessagesByConversation((prev) => {
      const existing = prev[msg.conversation_id] ?? [];
      if (existing.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [msg.conversation_id]: [...existing, msg] };
    });
  }

  function bumpConversation(conversationId: string, lastMessageAt: string, body: string | null) {
    setConversations((prev) =>
      [...prev]
        .map((c) =>
          c.id === conversationId ? { ...c, last_message_at: lastMessageAt, last_message_body: body } : c,
        )
        .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "")),
    );
  }

  // Realtime: new inbound/outbound messages for this business appear live,
  // in whichever conversation is open or listed — no page reload needed.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages-${businessId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `business_id=eq.${businessId}` },
        (payload) => {
          const msg = payload.new as Message;
          appendMessage(msg);
          bumpConversation(msg.conversation_id, msg.created_at, msg.body);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId]);

  // Load messages the first time a conversation is opened.
  useEffect(() => {
    if (!selectedId || messagesByConversation[selectedId]) return;
    const supabase = createClient();
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", selectedId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMessagesByConversation((prev) => ({ ...prev, [selectedId]: data }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      const matchesChannel = channelFilter === "todos" || c.channel?.type === channelFilter;
      const matchesQuery = !q || c.contact.name.toLowerCase().includes(q);
      return matchesChannel && matchesQuery;
    });
  }, [conversations, query, channelFilter]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !selected) return;
    setDraft("");
    setSendError(null);

    if (simulateMode) {
      setBotTyping(true);
      try {
        const result = await simulateInboundMessage(selected.id, text);
        if (result.inbound) {
          appendMessage(result.inbound);
          bumpConversation(selected.id, result.inbound.created_at, result.inbound.body);
        }
        if (result.reply) {
          appendMessage(result.reply);
          bumpConversation(selected.id, result.reply.created_at, result.reply.body);
        }
        if (result.error) setSendError(`Chekelin no pudo responder: ${result.error}`);
      } finally {
        setBotTyping(false);
      }
      return;
    }

    const result = await sendChatMessage(selected.id, text);

    if (result.message) {
      appendMessage(result.message);
      bumpConversation(selected.id, result.message.created_at, result.message.body);
    }
    if (result.botDisabled) {
      setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, bot_enabled: false } : c)));
    }
    if (result.sendError) setSendError(result.sendError);
    else if (result.error) setSendError(result.error);
  }

  async function handleSetStage(stage: ConversationStage) {
    if (!selected) return;
    setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, stage } : c)));
    await setConversationStage(selected.id, stage);
  }

  async function handleToggleBot() {
    if (!selected) return;
    const next = !selected.bot_enabled;
    setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, bot_enabled: next } : c)));
    await setConversationBotEnabled(selected.id, next);
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDemoData();
    } finally {
      setSeeding(false);
    }
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-center">
        <p className="max-w-sm text-[13.5px] text-ink-muted">
          Todavía no tienes conversaciones. Puedes sembrar datos de ejemplo para probar el chat mientras
          conectas WhatsApp, Instagram o Facebook.
        </p>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="rounded-lg bg-brand-dark px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {seeding ? "Sembrando…" : "Sembrar datos de ejemplo"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation list — full width on its own below `lg`, a fixed
          resizable column beside the thread at `lg` and up. */}
      <div
        style={{ ["--list-w" as string]: `${listWidth}px`, minWidth: LIST_WIDTH_MIN }}
        className={`${mobileView === "thread" ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-border bg-surface lg:w-[var(--list-w)]`}
      >
        <div className="shrink-0 px-4.5 pb-3 pt-5">
          <div className="mb-3 font-heading text-[19px] font-semibold text-ink">Chat</div>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar contacto"
              className="w-full rounded-[9px] border border-border bg-surface-2 py-2 pl-[30px] pr-2.5 text-[13.5px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {CHANNEL_FILTERS.map((ch) => {
              const active = channelFilter === ch.id;
              const color = ch.id !== "todos" ? CHANNEL_META[ch.id].color : undefined;
              const style = color
                ? active
                  ? { background: color, borderColor: color, color: "#fff" }
                  : { background: withAlpha(color, 0.14), borderColor: withAlpha(color, 0.3), color }
                : undefined;
              return (
                <button
                  key={ch.id}
                  onClick={() => setChannelFilter(ch.id)}
                  style={style}
                  className={`rounded-lg border px-2.5 py-[5px] text-[12.5px] font-semibold transition-colors ${
                    color
                      ? ""
                      : active
                        ? "border-brand-dark bg-brand-dark text-white"
                        : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                  }`}
                >
                  {ch.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          {filtered.map((c) => {
            const meta = c.channel ? CHANNEL_META[c.channel.type] : null;
            const lastBody = messagesByConversation[c.id]?.at(-1)?.body ?? c.last_message_body;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedId(c.id);
                  setMobileView("thread");
                  setSendError(null);
                  setShowDetail(false);
                }}
                className={`flex w-full gap-2.5 border-b border-border px-4.5 py-3 text-left ${
                  c.id === selectedId ? "bg-brand-tint" : "bg-surface hover:bg-surface-2"
                }`}
              >
                <div className="relative h-[34px] w-[34px] shrink-0 rounded-full bg-brand text-[13.5px] font-bold text-white">
                  <span className="flex h-full w-full items-center justify-center">
                    {initialsFor(c.contact.name)}
                  </span>
                  {meta && (
                    <span
                      className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-surface"
                      style={{ background: meta.color }}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate text-[13.5px] font-semibold text-ink">{c.contact.name}</div>
                    <div className="shrink-0 text-[11px] text-ink-soft">{relativeTime(c.last_message_at)}</div>
                  </div>
                  <div className="truncate text-[12.5px] text-ink-muted">{lastBody ?? ""}</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4.5 py-8 text-center text-[13px] text-ink-soft">Sin resultados.</div>
          )}
        </div>
      </div>

      {/* Drag handle to resize the conversation list (desktop only) */}
      <div
        onMouseDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar ancho de la lista de chats"
        className="group relative hidden w-[3px] shrink-0 cursor-col-resize bg-border lg:block"
      >
        <div className="absolute inset-y-0 -left-1.5 -right-1.5 group-hover:bg-brand-tint group-active:bg-brand-tint" />
      </div>

      {/* Thread — hidden below `lg` while the list is showing, so the two
          never fight for the same narrow viewport. */}
      <div
        className={`${mobileView === "list" ? "hidden lg:flex" : "flex"} min-w-0 flex-1 flex-col`}
      >
        {selected ? (
          <>
            <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border bg-surface px-6">
              <button
                onClick={() => setMobileView("list")}
                aria-label="Volver a la lista de chats"
                className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted lg:hidden"
              >
                <BackIcon className="h-4.5 w-4.5" />
              </button>
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brand text-[13.5px] font-bold text-white">
                {initialsFor(selected.contact.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold text-ink">{selected.contact.name}</div>
                <div className="flex items-center gap-1.5">
                  {selected.channel && (
                    <>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: CHANNEL_META[selected.channel.type].color }}
                      />
                      <span className="truncate text-xs text-ink-muted">
                        {CHANNEL_META[selected.channel.type].label} ·{" "}
                        {selected.contact.phone || selected.contact.ig_handle || selected.contact.fb_id}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Chekelin on/off — the AI only replies here while this is on;
                  sending a manual message below turns it off automatically. */}
              <button
                onClick={handleToggleBot}
                title={selected.bot_enabled ? "Chekelin está respondiendo automáticamente" : "Chekelin está pausado"}
                className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  selected.bot_enabled
                    ? "border-accent bg-accent-tint text-brand-dark"
                    : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                }`}
              >
                <BotIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Chekelin {selected.bot_enabled ? "activo" : "pausado"}</span>
              </button>

              {/* Compact tile replacing the old always-open side panel — tap
                  to see contact details and change the Chekeo stage. */}
              <button
                onClick={() => setShowDetail(true)}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-surface-3"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STAGE_META[selectedStage].color }} />
                <span className="hidden sm:inline">{STAGE_META[selectedStage].label}</span>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-bg px-6 py-5">
              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.direction === "out" ? "items-end" : "items-start"}`}>
                  {m.is_bot && (
                    <div className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-brand-dark">
                      <BotIcon className="h-3 w-3" />
                      Chekelin
                    </div>
                  )}
                  <div
                    className={`max-w-[60%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                      m.direction === "out"
                        ? m.is_bot
                          ? "rounded-br-sm bg-accent text-brand-dark"
                          : "rounded-br-sm bg-brand text-white"
                        : "rounded-bl-sm bg-surface-2 text-ink"
                    }`}
                  >
                    {m.body}
                    <div className="mt-1 text-[11px] opacity-65">
                      {new Date(m.created_at).toLocaleTimeString("es-HN", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))}
              {botTyping && (
                <div className="flex items-start">
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-muted">
                    <BotIcon className="h-3.5 w-3.5" />
                    Chekelin está escribiendo…
                  </div>
                </div>
              )}
              {messages.length === 0 && !botTyping && (
                <div className="py-10 text-center text-[13px] text-ink-soft">Sin mensajes todavía.</div>
              )}
            </div>

            {sendError && (
              <div className="shrink-0 border-t border-danger-border bg-danger-tint px-6 py-2 text-[12.5px] text-danger">
                {sendError}
              </div>
            )}
            {simulateMode && (
              <div className="shrink-0 border-t border-accent bg-accent-tint px-6 py-1.5 text-[12px] font-semibold text-brand-dark">
                Modo prueba: estás escribiendo como si fueras el cliente, para ver cómo responde Chekelin.
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-6 py-3.5">
              <button
                onClick={() => setSimulateMode((v) => !v)}
                title="Simular mensaje de cliente (solo para pruebas, sin WhatsApp real)"
                aria-pressed={simulateMode}
                className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                  simulateMode
                    ? "border-accent bg-accent text-brand-dark"
                    : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                }`}
              >
                <BotIcon className="h-4 w-4" />
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={simulateMode ? "Escribe como si fueras el cliente…" : "Escribe una respuesta…"}
                className="flex-1 rounded-[22px] border border-border bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
              />
              <button
                onClick={handleSend}
                disabled={botTyping}
                aria-label="Enviar"
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-60"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13.5px] text-ink-soft">
            Selecciona una conversación
          </div>
        )}
      </div>

      {/* Contact detail drawer — opened on demand from the header tile,
          instead of permanently reserving a third column. */}
      <AnimatePresence>
        {selected && showDetail && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setShowDetail(false)}
              className="fixed inset-0 z-10 bg-black/30"
            />
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
              transition={
                prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }
              }
              className="fixed right-0 top-0 z-20 flex h-full w-[380px] max-w-[calc(100vw-32px)] flex-col gap-5 overflow-y-auto bg-surface p-6 shadow-[-12px_0_32px_rgba(0,0,0,0.14)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
                    {initialsFor(selected.contact.name)}
                  </div>
                  <div className="font-heading text-[16.5px] font-semibold text-ink">
                    {selected.contact.name}
                  </div>
                </div>
                <button
                  aria-label="Cerrar"
                  onClick={() => setShowDetail(false)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-1 text-[13.5px] text-ink-muted">
                <div>{selected.contact.phone || selected.contact.ig_handle || selected.contact.fb_id}</div>
                <div>Conversación desde {relativeTime(selected.created_at)}</div>
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-ink-muted">Etapa en el chekeo</div>
                <div className="flex flex-col gap-1.5">
                  {STAGE_ORDER.map((s) => {
                    const meta = STAGE_META[s];
                    const active = selectedStage === s;
                    return (
                      <button
                        key={s}
                        onClick={() => handleSetStage(s)}
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

              <div>
                <div className="mb-1.5 text-xs uppercase tracking-wide text-ink-muted">Notas</div>
                <div className="rounded-[10px] bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink">
                  {selected.contact.notes || "Sin notas todavía."}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
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
function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
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
function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}
function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4" />
      <circle cx="12" cy="3" r="1" />
      <path d="M8 14v1" />
      <path d="M16 14v1" />
    </svg>
  );
}
