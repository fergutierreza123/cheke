"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { seedDemoData, setConversationStage, setConversationBotEnabled, sendProductToConversation } from "../actions";
import { sendChatMessage, simulateInboundMessage } from "./actions";
import { initialsFor, relativeTime, formatLempiras, formatMessageTime, CHANNEL_META, STAGE_META, STAGE_ORDER, withAlpha } from "@/lib/format";
import { ChannelIcon } from "@/components/ChannelIcon";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import type { ChannelType, ConversationStage, ConversationWithContact, Message, Product, Template } from "@/lib/types";

const CHANNEL_FILTERS: Array<{ id: ChannelType | "todos"; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
];

// WhatsApp uses each platform's own UI font; this stack resolves to the same
// one on iPhone/Mac (San Francisco), Android (Roboto) and Windows (Segoe UI).
const WHATSAPP_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif';

const LIST_WIDTH_KEY = "cheke-chat-list-width";
const LIST_WIDTH_MIN = 240;
const LIST_WIDTH_MAX = 460;
const LIST_WIDTH_DEFAULT = 320;


export function ChatView({
  businessId,
  conversations: initialConversations,
  products,
  templates,
  initialSelectedId,
  initialMessages,
}: {
  businessId: string;
  conversations: ConversationWithContact[];
  products: Product[];
  templates: Template[];
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
  const [showProductPicker, setShowProductPicker] = useState(false);
  // Picking a product no longer sends it immediately — it loads a preview
  // into the compose area (image, name, price) so the agent can see exactly
  // what's about to go out, optionally add a caption, and confirm with the
  // normal Send button.
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [sendingProduct, setSendingProduct] = useState(false);
  // Plantillas work like WhatsApp Business's own quick replies — picking
  // one inserts its text into the compose box (placeholders and all) for
  // the agent to fill in/edit, rather than sending it outright.
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [listWidth, setListWidth] = useState(LIST_WIDTH_DEFAULT);
  const resizing = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  // Ticks forward every second so demo message statuses (see
  // effectiveStatus below) visibly advance over time with no user
  // interaction needed. Stored as state (not read live via Date.now() at
  // render time) because calling an impure function during render is
  // disallowed — this keeps the component pure while still updating.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
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
  const messages = useMemo(
    () => (selectedId ? (messagesByConversation[selectedId] ?? []) : []),
    [selectedId, messagesByConversation],
  );

  function appendMessage(msg: Message) {
    setMessagesByConversation((prev) => {
      const existing = prev[msg.conversation_id] ?? [];
      if (existing.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [msg.conversation_id]: [...existing, msg] };
    });
  }

  // Real delivered/read ticks only ever arrive via a genuine WhatsApp
  // webhook call, which can't happen yet (Meta business verification still
  // pending — see README). So a freshly-sent message would otherwise sit on
  // a single ✓ forever in the demo. This derives a demo progression from
  // elapsed time since created_at instead — ✓ for the first 1.2s, ✓✓
  // (delivered) after that, blue ✓✓ (read) after 3.2s — same as WhatsApp's
  // own animation. Being time-based (not a one-shot timer fired only at the
  // moment the message was appended) means it also applies correctly to
  // messages loaded fresh from the database on page load/reload, not just
  // ones sent live during the current session. A real status update always
  // takes precedence, since this branch is only reached while the DB status
  // is still "sent".
  function effectiveStatus(m: Message): Message["status"] {
    if (m.direction !== "out" || m.status !== "sent") return m.status;
    const elapsed = now - new Date(m.created_at).getTime();
    if (elapsed > 3200) return "read";
    if (elapsed > 1200) return "delivered";
    return "sent";
  }

  // A delivery/read receipt from Meta updates an existing row (not an
  // insert) — without this, those status changes only ever showed up after
  // a full page reload.
  function patchMessage(msg: Message) {
    setMessagesByConversation((prev) => {
      const existing = prev[msg.conversation_id];
      if (!existing) return prev;
      return {
        ...prev,
        [msg.conversation_id]: existing.map((m) => (m.id === msg.id ? msg : m)),
      };
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
  // Also listens for UPDATE: a WhatsApp delivery/read receipt (Meta's
  // webhook calling updateMessageStatus) changes an existing row's status,
  // which is how the ✓✓ ticks below actually advance once WhatsApp is live.
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `business_id=eq.${businessId}` },
        (payload) => {
          patchMessage(payload.new as Message);
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

  // Keep the newest message in view — without this, a message you just
  // sent can land below the fold with no visible change, which reads as
  // "it didn't send" and invites clicking Send again.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [messages, prefersReducedMotion]);

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
    if (!selected || (!text && !pendingProduct)) return;
    setSendError(null);

    if (pendingProduct) {
      setSendingProduct(true);
      try {
        const result = await sendProductToConversation(selected.id, pendingProduct, text);
        // The message itself arrives through the Realtime subscription
        // above (same as any other outbound message) — nothing to append.
        if (result.error) setSendError(result.error);
        else {
          setDraft("");
          setPendingProduct(null);
        }
      } finally {
        setSendingProduct(false);
      }
      return;
    }

    setDraft("");

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
        if (result.error) setSendError(`chekelin no pudo responder: ${result.error}`);
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

  function handlePickProduct(product: Product) {
    setShowProductPicker(false);
    setSendError(null);
    setPendingProduct(product);
  }

  function handlePickTemplate(template: Template) {
    setShowTemplatePicker(false);
    // Fill the variables we actually know (the product loaded in the compose
    // area, if any); anything left over is highlighted below so the agent can
    // just type over it.
    let text = template.body;
    if (pendingProduct) {
      text = text
        .replaceAll("{{producto}}", pendingProduct.name)
        .replaceAll("{{precio}}", formatLempiras(pendingProduct.price_hnl));
    }
    setDraft(text);
    const input = draftInputRef.current;
    input?.focus();
    const blank = /\{\{[^}]+\}\}/.exec(text);
    if (input && blank) {
      // after React has committed the new value to the input
      window.setTimeout(() => input.setSelectionRange(blank.index, blank.index + blank[0].length), 30);
    }
  }

  function handlePickEmoji(emoji: string) {
    setDraft((prev) => prev + emoji);
    draftInputRef.current?.focus();
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
                  {c.channel && (
                    <ChannelIcon
                      type={c.channel.type}
                      className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-surface"
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
            <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border bg-surface px-3 py-2.5 lg:h-16 lg:flex-nowrap lg:px-6 lg:py-0">
              <button
                onClick={() => setMobileView("list")}
                aria-label="Volver a la lista de chats"
                className="-ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-muted lg:hidden"
              >
                <BackIcon className="h-4.5 w-4.5" />
              </button>
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-brand text-[13.5px] font-bold text-white">
                {initialsFor(selected.contact.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold text-ink">{selected.contact.name}</div>
                <div className="flex items-center gap-1.5">
                  {selected.channel && (
                    <>
                      <ChannelIcon type={selected.channel.type} className="h-3.5 w-3.5 shrink-0 rounded-full" />
                      <span className="truncate text-xs text-ink-muted">
                        {CHANNEL_META[selected.channel.type].label} ·{" "}
                        {selected.contact.phone || selected.contact.ig_handle || selected.contact.fb_id}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* On phones the controls drop to their own row under the name; on
                  desktop they sit inline at the right. */}
              <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
              {/* Chekelin on/off — the AI only replies here while this is on;
                  sending a manual message below turns it off automatically. */}
              <button
                onClick={handleToggleBot}
                title={selected.bot_enabled ? "chekelin está respondiendo automáticamente" : "chekelin está pausado"}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors lg:h-[30px] ${
                  selected.bot_enabled
                    ? "border-accent bg-accent-tint text-brand-dark"
                    : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset, not worth next/image's overhead here */}
                <img src="/logos/cheke-icon-blue.png" alt="" className="h-3.5 w-3.5 object-contain" />
                <span className="hidden sm:inline">chekelin {selected.bot_enabled ? "activo" : "pausado"}</span>
              </button>

              {/* Demo/testing only — tucked away as a small secondary icon
                  instead of a primary compose-bar button, since real
                  WhatsApp sending doesn't need this; it exists purely to
                  show chekelin's first-reply flow before WhatsApp is live. */}
              <button
                onClick={() => setSimulateMode((v) => !v)}
                title="Modo prueba: simular mensaje de cliente (sin WhatsApp real)"
                aria-pressed={simulateMode}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors lg:h-[30px] lg:w-[30px] ${
                  simulateMode
                    ? "border-accent bg-accent-tint text-brand-dark"
                    : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                }`}
              >
                <FlaskIcon className="h-3.5 w-3.5" />
              </button>

              {/* A plain colored pill here just read as a static label, not
                  something clickable — a real dropdown with its own
                  caption makes both facts (what it is, that it's
                  editable) obvious at a glance. Changes the stage
                  directly, no need to open the side panel for this. */}
              {/* The visible text is a plain span so it can be sized to match
                  the other controls; the real <select> sits invisibly on top
                  (16px, so iOS doesn't zoom the page on focus) and still opens
                  the native picker — a wheel on iPhone. */}
              <label className="relative flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface-2 pl-2.5 pr-2 text-[12.5px] font-semibold text-ink lg:h-[30px] lg:min-w-[250px] lg:flex-none">
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-soft sm:text-[10.5px]">
                  <span className="sm:hidden">Estado</span>
                  <span className="hidden sm:inline">Estado de venta</span>
                </span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STAGE_META[selectedStage].color }} />
                <span className="min-w-0 flex-1 truncate">{STAGE_META[selectedStage].label}</span>
                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                <select
                  value={selectedStage}
                  onChange={(e) => handleSetStage(e.target.value as ConversationStage)}
                  aria-label="Estado de venta"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  {STAGE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_META[s].label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Opens the side panel for contact details (phone, notes) —
                  the stage picker used to live only inside this panel,
                  which buried a very common action two clicks deep. */}
              <button
                onClick={() => setShowDetail(true)}
                title="Ver detalles del contacto"
                aria-label="Ver detalles del contacto"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-ink-muted transition-colors hover:bg-surface-3 lg:h-[30px] lg:w-[30px]"
              >
                <InfoIcon className="h-3.5 w-3.5" />
              </button>
              </div>
            </div>

            {/* Looks and reads like WhatsApp on purpose, so clients moving their
                conversations here don't feel a change: beige wallpaper, white
                / green bubbles, the time tucked into the last line of the
                text instead of on its own row, and the phone's own system
                font (SF on iPhone, Roboto on Android, Segoe UI on Windows —
                the same family WhatsApp uses on each). */}
            <div
              className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#EFEAE2] px-3 py-3 lg:px-[6%] lg:py-4"
              style={{ fontFamily: WHATSAPP_FONT }}
            >
              {messages.map((m, i) => {
                const out = m.direction === "out";
                const prev = messages[i - 1];
                // Bubbles from the same side in a row are tight (2px) and only
                // the first gets the pointed corner, like WhatsApp's tail.
                const firstInRun = !prev || prev.direction !== m.direction;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${out ? "items-end" : "items-start"} ${i === 0 ? "" : firstInRun ? "mt-2" : "mt-[2px]"}`}
                  >
                    {m.is_bot && !(prev && prev.is_bot) && (
                      <div className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-brand-dark">
                        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
                        <img src="/logos/cheke-icon-blue.png" alt="" className="h-3 w-3 object-contain" />
                        chekelin
                      </div>
                    )}
                    <div
                      className={`relative max-w-[82%] rounded-[7.5px] px-[9px] pb-[7px] pt-[6px] text-[14.2px] leading-[19px] text-[#111B21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] lg:max-w-[65%] ${
                        out ? "bg-[#D9FDD3]" : "bg-white"
                      } ${firstInRun ? (out ? "rounded-tr-none" : "rounded-tl-none") : ""}`}
                    >
                      {m.media_url && (
                        // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL sent as part of a product message
                        <img
                          src={m.media_url}
                          alt=""
                          className="-mx-1 mb-1 mt-0.5 max-h-48 w-[calc(100%+8px)] rounded-md object-cover"
                        />
                      )}
                      <div className="flow-root whitespace-pre-line break-words">
                        {m.body}
                        {/* Floats into the end of the last line; if there's no
                            room it drops below — that's what keeps short
                            messages in a short bubble. */}
                        <span className="float-right -mb-[3px] ml-2 mt-[5px] inline-flex select-none items-center gap-[3px] text-[11px] leading-[15px] text-[#667781]">
                          {formatMessageTime(m.created_at)}
                          {out && <MessageStatusIcon status={effectiveStatus(m)} />}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {botTyping && (
                <div className="mt-2 flex flex-col items-end">
                  <div className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-brand-dark">
                    {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
                    <img src="/logos/cheke-icon-blue.png" alt="" className="h-3 w-3 object-contain" />
                    chekelin
                  </div>
                  <div className="flex items-center gap-1 rounded-[7.5px] rounded-tr-none bg-[#D9FDD3] px-3 py-[11px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-[#8696A0]"
                        animate={prefersReducedMotion ? undefined : { y: [0, -4, 0] }}
                        transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15, ease: "easeInOut" }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {messages.length === 0 && !botTyping && (
                <div className="py-10 text-center text-[13px] text-ink-soft">Sin mensajes todavía.</div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {sendError && (
              <div className="shrink-0 border-t border-danger-border bg-danger-tint px-4 py-2 lg:px-6 text-[12.5px] text-danger">
                {sendError}
              </div>
            )}
            {simulateMode && !pendingProduct && (
              <div className="shrink-0 border-t border-accent bg-accent-tint px-4 py-1.5 lg:px-6 text-[12px] font-semibold text-brand-dark">
                Modo prueba: estás escribiendo como si fueras el cliente, para ver cómo responde chekelin.
              </div>
            )}
            {/* Draft preview — picking a product no longer sends it right
                away. It loads here so the agent sees exactly what's about
                to go out (photo included) and can still cancel or add a
                caption before confirming with Send. */}
            {pendingProduct && (
              <div className="flex shrink-0 items-center gap-3 border-t border-accent bg-accent-tint px-4 py-2.5 lg:px-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface">
                  {pendingProduct.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage thumbnail
                    <img src={pendingProduct.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <BoxIcon className="h-4 w-4 text-ink-soft" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-brand-dark">{pendingProduct.name}</div>
                  <div className="text-[11.5px] text-brand-dark/80">{formatLempiras(pendingProduct.price_hnl)}</div>
                </div>
                <button
                  onClick={() => setPendingProduct(null)}
                  aria-label="Cancelar envío de producto"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-brand-dark"
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-3 py-2.5 lg:px-6 lg:py-3.5">
              <div className="relative">
                <button
                  onClick={() => setShowProductPicker((v) => !v)}
                  title="Enviar un producto del catálogo"
                  aria-pressed={showProductPicker}
                  className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                    showProductPicker
                      ? "border-brand bg-brand-tint text-brand-dark"
                      : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                  }`}
                >
                  <BoxIcon className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {showProductPicker && (
                    <motion.div
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                      className="absolute bottom-[46px] left-0 z-10 w-56 rounded-[10px] border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,16,55,0.14)]"
                    >
                      <div className="px-2 py-1 text-[11px] text-ink-soft">Enviar producto del catálogo…</div>
                      <div className="max-h-56 overflow-y-auto">
                        {products.length === 0 && (
                          <div className="px-2 py-1.5 text-[12.5px] text-ink-soft">
                            Todavía no tienes productos en el catálogo.
                          </div>
                        )}
                        {products.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handlePickProduct(p)}
                            className="block w-full truncate rounded-[7px] px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-2"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowTemplatePicker((v) => !v)}
                  title="Usar una plantilla (respuesta rápida)"
                  aria-pressed={showTemplatePicker}
                  className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                    showTemplatePicker
                      ? "border-brand bg-brand-tint text-brand-dark"
                      : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                  }`}
                >
                  <TemplateIcon className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {showTemplatePicker && (
                    <motion.div
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                      className="absolute bottom-[46px] left-0 z-10 w-64 rounded-[10px] border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,16,55,0.14)]"
                    >
                      <div className="px-2 py-1 text-[11px] text-ink-soft">Respuesta rápida…</div>
                      <div className="max-h-56 overflow-y-auto">
                        {templates.length === 0 && (
                          <div className="px-2 py-1.5 text-[12.5px] text-ink-soft">
                            Todavía no tienes plantillas creadas.
                          </div>
                        )}
                        {templates.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => handlePickTemplate(t)}
                            className="block w-full rounded-[7px] px-2 py-1.5 text-left hover:bg-surface-2"
                          >
                            <div className="truncate text-[12.5px] font-semibold text-ink">{t.name}</div>
                            <div className="truncate text-[11px] text-ink-soft">{t.body}</div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  title="Emoji"
                  aria-pressed={showEmojiPicker}
                  className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                    showEmojiPicker
                      ? "border-brand bg-brand-tint text-brand-dark"
                      : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                  }`}
                >
                  <EmojiIcon className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {showEmojiPicker && (
                    <motion.div
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                      className="absolute bottom-[46px] left-0 z-10 overflow-hidden rounded-[10px] shadow-[0_8px_24px_rgba(0,16,55,0.14)]"
                    >
                      <EmojiPicker
                        onEmojiClick={(emojiData: EmojiClickData) => handlePickEmoji(emojiData.emoji)}
                        autoFocusSearch={false}
                        width={320}
                        height={380}
                        previewConfig={{ showPreview: false }}
                        searchPlaceHolder="Buscar emoji"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <input
                ref={draftInputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  pendingProduct
                    ? "Agrega un mensaje (opcional)…"
                    : simulateMode
                      ? "Escribe como si fueras el cliente…"
                      : "Escribe un mensaje"
                }
                className="min-w-0 flex-1 rounded-[22px] border border-border bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
              />
              <button
                onClick={handleSend}
                disabled={botTyping || sendingProduct}
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
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" />
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
function FlaskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v6.5L4.5 17a2 2 0 0 0 1.76 3h11.48a2 2 0 0 0 1.76-3L15 8.5V2" />
      <path d="M8 2h8" />
      <path d="M7.5 14h9" />
    </svg>
  );
}
function EmojiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </svg>
  );
}
// WhatsApp-style delivery ticks: one gray check (sent), two gray checks
// (delivered), two blue checks (read) — nothing shown for a failed send
// since that's already surfaced via the sendError banner above.
function MessageStatusIcon({ status }: { status: Message["status"] }) {
  if (status === "failed") return null;
  if (status === "sent") {
    return (
      <svg viewBox="0 0 16 11" className="h-3 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 5.5L5 10 15 1" />
      </svg>
    );
  }
  const color = status === "read" ? "#53BDEB" : "currentColor";
  return (
    <svg viewBox="0 0 20 11" className="h-3 w-4" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 5.5L5 10 15 1" />
      <path d="M6 5.5L10 10 20 1" />
    </svg>
  );
}
function BoxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.79 0l-8-4a2 2 0 0 1-1.1-1.8V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0z" />
      <path d="M2.32 6.16L12 11l9.68-4.84" />
      <path d="M12 22.76V11" />
    </svg>
  );
}
function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}
