"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { seedDemoData, setConversationStage, setConversationBotEnabled, sendProductToConversation } from "../actions";
import {
  sendChatMessage,
  simulateInboundMessage,
  sendPaymentRequest,
  listOpenOrders,
  resolveOrder,
  reassignConversation,
  listConversationNotes,
  addTeamNote,
  resolveComplaint,
  reactToMessage,
  retryMessage,
  markConversationRead,
  sendStoreLocation,
  type OpenOrder,
} from "./actions";
import { setChekelinOff } from "../actions";
import {
  CHEKELIN_OFF_OPTIONS,
  chekelinChatState,
  chekelinOffLabel,
  isChekelinOff,
  type ChekelinChatState,
  type ChekelinOffDuration,
} from "@/lib/chekelinState";
import type { Role } from "@/lib/stores";
import type { QuickReply } from "@/lib/quickReplies";
import { useQuickReplyPicker } from "./QuickReplyPicker";
import { CameraIcon, ClipIcon, PhotoIcon, useComposerMedia, type MediaSendResult } from "./ComposerMedia";
import { AttachSheet } from "./AttachSheet";
import { NoteComposerBar, NoteStrip } from "./NoteStrip";
import { useMentionPicker } from "./MentionPicker";
import { mentionedIds } from "@/lib/conversationNotes";
import { WhatsAppTemplateSender } from "./WhatsAppTemplateSender";

export type ChatPerson = { userId: string; name: string; role: Role; away: boolean; storeIds: string[] };
export type ChekelinStore = { id: string; name: string; offUntil: string | null; canManage: boolean };

const CHEKELIN_STATE_LABEL: Record<ChekelinChatState, string> = {
  active: "chekelin activo",
  silent: "chekelin en silencio",
  complaint: "chekelin en silencio",
  paused: "chekelin pausado",
  off: "chekelin apagado",
};
const CHEKELIN_STATE_HINT: Record<ChekelinChatState, string> = {
  active: "chekelin atiende y vende en este chat (pedido, datos de pago, comprobante). Toca para pausarlo aquí.",
  silent:
    "chekelin le pasó este chat a una persona. Solo responde datos simples (precio, tallas, envío…) si nadie contesta en 5 minutos. Toca para pausarlo aquí.",
  complaint: "Hay una queja abierta: chekelin no responde hasta que alguien la marque resuelta.",
  paused: "chekelin está pausado en este chat. Toca para que vuelva a atender.",
  off: "chekelin está apagado en esta tienda.",
};
import { parseAmount, formatAmount, orderConcept, type OrderItem } from "@/lib/payments";
import { initialsFor, relativeTime, formatLempiras, formatMessageTime, CHANNEL_META, STAGE_META, STAGE_ORDER, withAlpha } from "@/lib/format";
import { ChannelIcon } from "@/components/ChannelIcon";
import { MessageMedia, mediaReplacesBody } from "./MessageMedia";
import {
  DeletedBody,
  MessageMenu,
  QuotedMessage,
  ReactionChips,
  ReplyBar,
  SwipeToReply,
  reactionChoices,
} from "./MessageExtras";
import { BrandMark } from "@/components/BrandMark";
import { StoreFilter, StoreTag, type StoreNames } from "@/components/StoreTag";
import { humanAgentNotice, replyWindow, windowClosedMessage } from "@/lib/messagingWindow";
import { composerRules, WHATSAPP_PHONE_APP_HINT } from "@/lib/composerRules";

const DAY_MS = 24 * 60 * 60 * 1000;
import { explainWhatsAppError, isBillingError, META_BILLING_HUB_URL } from "@/lib/whatsappErrors";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { ContactTags } from "@/components/ContactTags";
import type { ChannelType, ConversationNote, ConversationStage, ConversationWithContact, Message, Product, Template } from "@/lib/types";
import { countUnread, inUnreadFilter, unreadAfterMessage, unreadBadge } from "@/lib/unread";
import { locationSendPlan, type StoreLocation } from "@/lib/storeLocation";
import { copyableText } from "@/lib/copyMessage";
import { dayLabel, displayStatus, insertInOrder, sameDay } from "@/lib/chatTimeline";
import { referralLabel } from "@/lib/adReferral";

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
  storeIds,
  storeNames = null,
  conversations: initialConversations,
  products,
  templates,
  initialSelectedId,
  initialMessages,
  initialNotes = [],
  startInThread = false,
  currentUserId = null,
  people = [],
  chekelinAvailable = true,
  chekelinStores = [],
  highlightAssignment = false,
  highlightOrderId = null,
  quickReplies = [],
  canManageQuickReplies = false,
  storeLocations = {},
  tagSuggestions,
}: {
  businessId: string;
  // The Tiendas on screen: live messages from any other Tienda are ignored.
  storeIds: string[];
  // "Todas las tiendas": a tag per conversation and a store filter.
  storeNames?: StoreNames | null;
  conversations: ConversationWithContact[];
  products: Product[];
  templates: Template[];
  initialSelectedId: string | null;
  initialMessages: Message[];
  // Team-only notes of the initially open conversation (the /demo showcase;
  // real chats load them below).
  initialNotes?: ConversationNote[];
  // Phones: open straight into the conversation (a tapped notification)
  // instead of the chat list.
  startInThread?: boolean;
  currentUserId?: string | null;
  // Everyone in the Negocio, for Asignación (shown only with 2+ people).
  people?: ChatPerson[];
  // chekelin is in the Negocio's plan (cheKe Plus / Pro).
  chekelinAvailable?: boolean;
  // chekelin's switch for each Tienda on screen.
  chekelinStores?: ChekelinStore[];
  // Opened from the 10-minute alert: point at the reassign control.
  highlightAssignment?: boolean;
  // Opened from a "comprobante recibido" alert: point at "Confirmar pago".
  highlightOrderId?: string | null;
  // Respuestas rápidas: typing "/" in the composer offers them.
  quickReplies?: QuickReply[];
  canManageQuickReplies?: boolean;
  // "Ubicación": each Tienda's saved location ("Lo que chekelin sabe").
  storeLocations?: Record<string, { name: string; location: StoreLocation }>;
  // Etiquetas: the Negocio's existing ones; without it (the /demo) they're read-only.
  tagSuggestions?: string[];
}) {
  const showAssignment = people.length >= 2;
  const [stores, setStores] = useState(chekelinStores);
  const [notesByConversation, setNotesByConversation] = useState<Record<string, ConversationNote[]>>(
    initialSelectedId && initialNotes.length > 0 ? { [initialSelectedId]: initialNotes } : {},
  );
  const [showChekelinMenu, setShowChekelinMenu] = useState(false);
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>(
    initialSelectedId ? { [initialSelectedId]: initialMessages } : {},
  );
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelType | "todos">("todos");
  const [storeFilter, setStoreFilter] = useState<string | "all">("all");
  // "No leídos": only chats with messages nobody on the team has opened.
  const [unreadOnly, setUnreadOnly] = useState(false);
  // The chat tapped in the list: stays under "No leídos" while it's read.
  const [openedId, setOpenedId] = useState<string | null>(null);
  // "Ubicación" picked in the "+" sheet: a preview to confirm before it goes.
  const [pendingLocation, setPendingLocation] = useState(false);
  const [sendingLocation, setSendingLocation] = useState(false);
  // A short confirmation at the bottom ("Copiado").
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  // Demo/testing only — lets you type as if you were the customer so
  // Chekelin's first-reply flow can be shown without a real WhatsApp number
  // connected yet.
  const [simulateToggle, setSimulateMode] = useState(false);
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
  // WhatsApp after 24 h: which conversation has "Enviar plantilla" open
  // (the "+" sheet's "Plantilla" opens it instead of the fill-in picker).
  const [templateSenderFor, setTemplateSenderFor] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Phones/tablets: WhatsApp's "+" sheet with everything besides text.
  const [showAttach, setShowAttach] = useState(false);
  // Payment request ("Cobrar"): the form's fields, and the orders still
  // waiting on payment per conversation (shown above the composer).
  const [showPayment, setShowPayment] = useState(false);
  const [payConcept, setPayConcept] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payLink, setPayLink] = useState("");
  const [payInstructions, setPayInstructions] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [ordersByConversation, setOrdersByConversation] = useState<Record<string, OpenOrder[]>>({});
  const [listWidth, setListWidth] = useState(LIST_WIDTH_DEFAULT);
  const resizing = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const draftInputRef = useRef<HTMLTextAreaElement>(null);
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
  // side, so only one shows at a time. Like WhatsApp, a phone opens on the
  // list — unless it was opened for one conversation (a tapped notification).
  const [mobileView, setMobileView] = useState<"list" | "thread">(startInThread ? "thread" : "list");
  const [showDetail, setShowDetail] = useState(false);
  // The failed message whose reason is expanded (tap "No entregado").
  const [openFailureId, setOpenFailureId] = useState<string | null>(null);
  // The failed message being sent again ("Reintentar").
  const [retryingId, setRetryingId] = useState<string | null>(null);
  // "Responder": the message the next send quotes, and the bubble whose
  // menu (reactions + Responder) is open.
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // "Nota para el equipo": the composer saves a team-only note instead of
  // writing to the customer, until its X closes it.
  const [noteMode, setNoteMode] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // The bubble just jumped to from a quote, briefly highlighted.
  const [flashId, setFlashId] = useState<string | null>(null);
  // Touch screens swipe/hold a bubble; mouse screens get a hover button.
  const [touchScreen, setTouchScreen] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external source (media query) on mount
    setTouchScreen(query.matches);
    const onChange = (e: MediaQueryListEvent) => setTouchScreen(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
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
  // A sample chat: /demo, or a seeded / app-reviewer channel that was never
  // connected to Meta (no external id). Nobody is on the other side.
  const sampleChat = businessId === "demo" || !selected?.channel?.external_id;
  // Modo prueba only exists in sample chats: in a real customer's chat a
  // fake customer message would mix into their history.
  const simulateMode = simulateToggle && sampleChat;
  // Falls back to "nuevo" if the `stage` migration hasn't run yet on this
  // database — avoids a hard crash on old rows missing the column.
  const selectedStage = selected?.stage ?? "nuevo";
  // Past the reply window (WhatsApp: 24 h; Instagram/Facebook: 7 days) free-
  // text sending is blocked (also enforced server-side) until the customer
  // writes again. Instagram/Facebook between 24 h and 7 days: a person can
  // still answer, chekelin can't.
  const replyState = replyWindow(selected?.channel?.type, selected?.window_expires_at, now);
  // What the composer allows right now (src/lib/composerRules.ts). Test mode
  // types, records and attaches as the customer, which is exactly what
  // reopens the window.
  const rules = composerRules({
    channelType: selected?.channel?.type,
    coexistence: selected?.channel?.coexistence,
    replyState,
    simulateMode,
  });
  const sendBlocked = !rules.canSendText;
  // Closed WhatsApp chat: "Plantilla" means an approved template, not text.
  const approvedTemplateOnly = rules.approvedTemplateOnly;
  const quickReplyPicker = useQuickReplyPicker({
    replies: quickReplies,
    draft,
    setDraft,
    contactName: selected?.contact.name,
    inputRef: draftInputRef,
    disabled: !selected || sendBlocked || simulateMode || noteMode,
    canManage: canManageQuickReplies,
  });
  // "@" in a note: the people who can open this chat, except yourself.
  const mentionable = selected
    ? people.filter((p) => p.storeIds.includes(selected.store_id) && p.userId !== currentUserId)
    : [];
  const mentionPicker = useMentionPicker({
    people: mentionable,
    draft,
    setDraft,
    inputRef: draftInputRef,
    disabled: !noteMode,
  });
  // Why nothing but Plantillas can go out right now: the mic stays visible
  // (grey) and says this when tapped.
  const mediaBlockedReason = rules.mediaBlockedReason;
  // Voice notes (mic, while the box is empty), documents (clip), photos and
  // videos (gallery / camera): issue #50 and composer parity. In Modo prueba
  // they arrive as the sample customer's.
  const composerMedia = useComposerMedia({
    conversationId: selected?.id ?? null,
    channelType: selected?.channel?.type,
    disabled: !selected || !rules.canSendMedia,
    blockedReason: selected ? mediaBlockedReason : null,
    caption: draft,
    onCaptionUsed: () => setDraft(""),
    demo: businessId === "demo",
    asCustomer: rules.asCustomer,
    replyToId: replyTo && replyTo.conversation_id === selected?.id && !rules.asCustomer ? replyTo.id : null,
    onSendStart: () => setReplyTo(null),
    onResult: handleMediaResult,
    onError: setSendError,
  });
  // The composer grows with multi-line text (up to ~6 lines), then scrolls.
  useEffect(() => {
    const el = draftInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Measured while hidden (phone list view) scrollHeight is 0: leave the
    // natural one-line height instead of collapsing the box.
    el.style.height = el.scrollHeight ? `${Math.min(el.scrollHeight, 140)}px` : "";
  }, [draft, selectedId, mobileView]);
  const messages = useMemo(
    () => (selectedId ? (messagesByConversation[selectedId] ?? []) : []),
    [selectedId, messagesByConversation],
  );
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  // A person opened the chat (and is looking at it): the customer sees their
  // messages as read. Again whenever a new one arrives while it's open.
  const unreadInboundId = useMemo(
    () => [...messages].reverse().find((m) => m.direction === "in" && m.status !== "read")?.id ?? null,
    [messages],
  );
  // "No leídos": the chat on screen stops counting (also in /demo, where
  // nothing is marked read in the database).
  const selectedUnread = conversations.find((c) => c.id === selectedId)?.unread_count ?? 0;
  useEffect(() => {
    if (!selectedId || selectedUnread === 0) return;
    const threadOnScreen = mobileView === "thread" || window.matchMedia("(min-width: 1024px)").matches;
    if (!threadOnScreen || document.visibilityState !== "visible") return;
    const timer = setTimeout(() => {
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)));
    }, 600);
    return () => clearTimeout(timer);
  }, [selectedId, selectedUnread, mobileView]);

  useEffect(() => {
    if (!selectedId || !unreadInboundId || businessId === "demo" || simulateMode) return;
    // Phones open on the list: the selected chat isn't on screen until tapped.
    const threadOnScreen = mobileView === "thread" || window.matchMedia("(min-width: 1024px)").matches;
    if (!threadOnScreen || document.visibilityState !== "visible") return;
    const timer = setTimeout(() => {
      markConversationRead(selectedId).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [selectedId, unreadInboundId, mobileView, businessId, simulateMode]);

  function jumpToMessage(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    setFlashId(id);
    setTimeout(() => setFlashId((current) => (current === id ? null : current)), 1200);
  }

  function startReply(m: Message) {
    setMenuFor(null);
    setReplyTo(m);
    draftInputRef.current?.focus();
  }

  // The business's reaction, shown at once and undone if Meta refuses it.
  async function handleReact(m: Message, emoji: string | null) {
    setMenuFor(null);
    const previous = m.reaction_out ?? null;
    const next = emoji && emoji === previous ? null : emoji;
    patchMessage({ ...m, reaction_out: next });
    // The public demo has no account behind it: the reaction stays on screen only.
    if (businessId === "demo") return;
    const result = await reactToMessage(m.id, next);
    if (result.error) {
      patchMessage({ ...m, reaction_out: previous });
      setSendError(result.error);
    } else if (result.reaction !== next) {
      patchMessage({ ...m, reaction_out: result.reaction ?? null });
    }
  }

  // "Reintentar": the failed bubble goes out again, in place.
  async function handleRetry(m: Message) {
    setRetryingId(m.id);
    setSendError(null);
    try {
      if (businessId === "demo") {
        patchMessage({ ...m, status: "sent", error_reason: null, error_code: null, created_at: new Date().toISOString() });
        return;
      }
      const result = await retryMessage(m.id);
      if (result.message) patchMessage(result.message);
      if (result.sendError ?? result.error) setSendError(result.sendError ?? result.error ?? null);
      else setOpenFailureId(null);
    } catch {
      setSendError("No se pudo reintentar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setRetryingId(null);
    }
  }

  // chekelin and Asignación for the open conversation.
  const selectedStore = selected ? stores.find((s) => s.id === selected.store_id) : undefined;
  const chatState: ChekelinChatState = selected
    ? chekelinChatState({
        available: chekelinAvailable,
        storeOffUntil: selectedStore?.offUntil,
        botEnabled: selected.bot_enabled,
        handedOffAt: selected.handed_off_at,
        complaintOpenAt: selected.complaint_open_at,
        nowMs: now,
      })
    : "off";
  const complaintOpen = Boolean(selected?.complaint_open_at);
  const assignee = selected?.assigned_to ? people.find((p) => p.userId === selected.assigned_to) : undefined;
  const assignable = selected ? people.filter((p) => p.storeIds.includes(selected.store_id)) : [];
  const canReassign = Boolean(selectedStore?.canManage) && assignable.length > 1;
  const selectedNotes = (selectedId && notesByConversation[selectedId]) || NO_NOTES;
  // An open Queja normally comes with its note (shown in NoteStrip); older
  // ones without it still get their own row.
  const complaintWithoutNote = complaintOpen && !selectedNotes.some((n) => n.kind === "complaint");
  // Automated messages say who wrote them: chekelin, or (plans without it)
  // a plain automatic message.
  const botLabel = chekelinAvailable ? "chekelin" : "Mensaje automático";

  // The Traspaso summary for the open conversation (team-only).
  useEffect(() => {
    if (!selectedId || businessId === "demo") return;
    let cancelled = false;
    listConversationNotes(selectedId)
      .then((notes) => {
        if (!cancelled) setNotesByConversation((prev) => ({ ...prev, [selectedId]: notes }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId, businessId]);

  async function handleReassign(userId: string) {
    if (!selected || !userId || userId === selected.assigned_to) return;
    const previous = selected.assigned_to;
    setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, assigned_to: userId } : c)));
    const result = await reassignConversation(selected.id, userId);
    if (result.error) {
      setSendError(result.error);
      setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, assigned_to: previous } : c)));
    }
  }

  // "Marcar queja resuelta" (Gerente or Dueño).
  async function handleResolveComplaint() {
    if (!selected) return;
    if (!confirm("¿Marcar la queja como resuelta? chekelin podrá volver a responder en este chat.")) return;
    const result = await resolveComplaint(selected.id);
    if (result.error) {
      setSendError(result.error);
      return;
    }
    setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, complaint_open_at: null } : c)));
  }

  async function handleChekelinStore(storeId: string, duration: ChekelinOffDuration | null) {
    setShowChekelinMenu(false);
    const result = await setChekelinOff(storeId, duration);
    if (result.error) {
      setSendError(result.error);
      return;
    }
    setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, offUntil: result.until ?? null } : s)));
  }

  // Pending charges for the open conversation (not in demo, which has no
  // signed-in business behind it).
  useEffect(() => {
    if (!selectedId || businessId === "demo") return;
    let cancelled = false;
    listOpenOrders(selectedId)
      .then((orders) => {
        if (!cancelled) setOrdersByConversation((prev) => ({ ...prev, [selectedId]: orders }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId, businessId]);

  function appendMessage(msg: Message) {
    setMessagesByConversation((prev) => {
      // A conversation that was never opened has no history loaded; adding
      // just this one message would make the "load on first open" step think
      // it's already loaded and show only this message. Leave it to that load.
      const existing = prev[msg.conversation_id];
      if (!existing) return prev;
      if (existing.some((m) => m.id === msg.id)) return prev;
      // Where its time says (an echo from the phone may belong higher up).
      return { ...prev, [msg.conversation_id]: insertInOrder(existing, msg) };
    });
  }

  // Ticks (src/lib/chatTimeline.ts): real chats show exactly what Meta
  // reported; only sample chats play WhatsApp's ✓ → ✓✓ → blue ✓✓ animation.
  function effectiveStatus(m: Message): Message["status"] {
    return displayStatus(m, { nowMs: now, sample: sampleChat });
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

  // Mirror of the conversation list's ids, readable from the Realtime handler
  // below (which is set up once and would otherwise see a stale list).
  const knownConversationIds = useRef<Set<string>>(new Set());
  const storeIdsRef = useRef(storeIds);
  useEffect(() => {
    storeIdsRef.current = storeIds;
  }, [storeIds]);
  useEffect(() => {
    const ids = knownConversationIds.current;
    ids.clear();
    conversations.forEach((c) => ids.add(c.id));
  }, [conversations]);

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
          // Another Tienda than the one(s) on screen (the selector).
          if (msg.store_id && !storeIdsRef.current.includes(msg.store_id)) return;
          appendMessage(msg);
          if (knownConversationIds.current.has(msg.conversation_id)) {
            bumpConversation(msg.conversation_id, msg.created_at, msg.body);
            setConversations((prev) =>
              prev.map((c) =>
                c.id === msg.conversation_id ? { ...c, unread_count: unreadAfterMessage(c.unread_count ?? 0, msg) } : c,
              ),
            );
          } else {
            // First message from a brand-new customer: their conversation
            // isn't in the list yet, so fetch it and add it to the top.
            knownConversationIds.current.add(msg.conversation_id);
            supabase
              .from("conversations")
              .select("*, contact:contacts(id, name, phone, ig_handle, fb_id, notes, tags), channel:channels(id, type, coexistence, external_id)")
              .eq("id", msg.conversation_id)
              .single()
              .then(({ data }) => {
                if (!data) {
                  knownConversationIds.current.delete(msg.conversation_id);
                  return;
                }
                const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
                const chan = Array.isArray(data.channel) ? data.channel[0] : data.channel;
                const conversation = {
                  ...data,
                  contact,
                  channel: chan ?? null,
                  last_message_body: msg.body,
                  unread_count: countUnread([msg]),
                } as ConversationWithContact;
                setConversations((prev) =>
                  prev.some((c) => c.id === conversation.id)
                    ? prev
                    : [conversation, ...prev].sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "")),
                );
              });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `business_id=eq.${businessId}` },
        (payload) => {
          const msg = payload.new as Message;
          patchMessage(msg);
          // Someone on the team opened the chat (it marks every message read).
          if (msg.direction === "in" && msg.status === "read") {
            setConversations((prev) =>
              prev.map((c) => (c.id === msg.conversation_id && c.unread_count ? { ...c, unread_count: 0 } : c)),
            );
          }
        },
      )
      // Asignación and chekelin's state change on the server (handoff,
      // someone replied, reassigned): keep the list and header current.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `business_id=eq.${businessId}` },
        (payload) => {
          const row = payload.new as ConversationWithContact;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === row.id
                ? {
                    ...c,
                    assigned_to: row.assigned_to,
                    bot_enabled: row.bot_enabled,
                    handed_off_at: row.handed_off_at,
                    chekelin_replies: row.chekelin_replies,
                    awaiting_since: row.awaiting_since,
                    complaint_open_at: row.complaint_open_at ?? null,
                    stage: row.stage ?? c.stage,
                    // Saved by the webhook right after the chat's first message.
                    referral_source: row.referral_source ?? c.referral_source,
                    referral_headline: row.referral_headline ?? c.referral_headline,
                    referral_url: row.referral_url ?? c.referral_url,
                  }
                : c,
            ),
          );
        },
      )
      // Orders chekelin takes, and receipts it receives, show up live
      // ("Cobro pendiente" / "Comprobante recibido · Confirmar pago").
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` },
        (payload) => {
          const row = payload.new as {
            id?: string;
            conversation_id?: string | null;
            status?: string;
            total_hnl?: number;
            items?: OrderItem[];
            payment_link?: string | null;
            created_at?: string;
            source?: string;
            receipt_at?: string | null;
          };
          if (!row?.id || !row.conversation_id) return;
          const conversationId = row.conversation_id;
          setOrdersByConversation((prev) => {
            const list = prev[conversationId];
            // Not loaded yet: it loads when the conversation is opened.
            if (!list) return prev;
            const rest = list.filter((o) => o.id !== row.id);
            if (row.status !== "awaiting_payment") return { ...prev, [conversationId]: rest };
            const order: OpenOrder = {
              id: row.id as string,
              total_hnl: Number(row.total_hnl ?? 0),
              concept: orderConcept(Array.isArray(row.items) ? row.items : []),
              payment_link: row.payment_link ?? null,
              created_at: row.created_at ?? new Date().toISOString(),
              by_chekelin: row.source === "chekelin",
              receipt_at: row.receipt_at ?? null,
            };
            return { ...prev, [conversationId]: [order, ...rest] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_notes", filter: `business_id=eq.${businessId}` },
        (payload) => {
          const note = payload.new as ConversationNote;
          setNotesByConversation((prev) =>
            prev[note.conversation_id] && !prev[note.conversation_id].some((n) => n.id === note.id)
              ? { ...prev, [note.conversation_id]: [note, ...prev[note.conversation_id]] }
              : prev,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId]);

  // A phone that was in the background (or lost signal) misses live updates,
  // so when the app comes back, reload the open conversation's messages.
  useEffect(() => {
    if (!selectedId || businessId === "demo") return;
    const supabase = createClient();
    function reload() {
      if (document.visibilityState !== "visible") return;
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (data) setMessagesByConversation((prev) => ({ ...prev, [selectedId as string]: data }));
        });
    }
    document.addEventListener("visibilitychange", reload);
    window.addEventListener("online", reload);
    return () => {
      document.removeEventListener("visibilitychange", reload);
      window.removeEventListener("online", reload);
    };
  }, [selectedId, businessId]);

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
      const matchesStore = storeFilter === "all" || c.store_id === storeFilter;
      const matchesUnread = !unreadOnly || inUnreadFilter(c, openedId);
      return matchesChannel && matchesQuery && matchesStore && matchesUnread;
    });
  }, [conversations, query, channelFilter, storeFilter, unreadOnly, openedId]);
  const unreadChats = conversations.filter((c) => (c.unread_count ?? 0) > 0).length;

  // Each Tienda has its own catalog: offer the open conversation's.
  const storeProducts = selected ? products.filter((p) => p.store_id === selected.store_id) : products;

  // "Nota para el equipo": saved for the team, never sent to the customer;
  // the people @mentioned get a push.
  async function handleSendNote() {
    const text = draft.trim();
    if (!selected || !text || sendingNote) return;
    setSendError(null);
    setSendingNote(true);
    try {
      const result = await addTeamNote(selected.id, text, mentionedIds(text, mentionable));
      const note = result.note;
      if (!note) {
        setSendError(result.error ?? "No se pudo guardar la nota.");
        return;
      }
      setDraft("");
      setNotesByConversation((prev) => {
        const list = prev[note.conversation_id] ?? [];
        return list.some((n) => n.id === note.id) ? prev : { ...prev, [note.conversation_id]: [note, ...list] };
      });
    } finally {
      setSendingNote(false);
    }
  }

  async function handleSend() {
    if (noteMode) {
      handleSendNote();
      return;
    }
    // A photo or video waiting in the strip: Send sends it, the typed text
    // as its caption.
    if (composerMedia.hasPendingVisual) {
      composerMedia.sendVisual();
      return;
    }
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

    if (simulateMode && businessId === "demo") {
      // /demo has no account behind it: the "customer's" message only shows
      // on screen (the server would have nothing to save it in).
      const inbound: Message = {
        id: crypto.randomUUID(),
        conversation_id: selected.id,
        business_id: "demo",
        direction: "in",
        body: text,
        media_url: null,
        status: "sent",
        is_bot: false,
        created_at: new Date().toISOString(),
      };
      handleMediaResult({ message: inbound });
      return;
    }

    if (simulateMode) {
      setBotTyping(true);
      try {
        const result = await simulateInboundMessage(selected.id, text);
        if (result.inbound) {
          appendMessage(result.inbound);
          bumpConversation(selected.id, result.inbound.created_at, result.inbound.body);
          // The "customer" wrote: the reply window is open again (server too).
          const reopened = new Date(Date.now() + DAY_MS).toISOString();
          setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, window_expires_at: reopened } : c)));
        }
        if (result.reply) {
          appendMessage(result.reply);
          bumpConversation(selected.id, result.reply.created_at, result.reply.body);
        }
        if (result.error && !result.inbound) {
          // The test message wasn't saved (real customer's chat, archived
          // Tienda…): give the text back and say why.
          setDraft(text);
          setSendError(result.error);
        } else if (result.error) setSendError(`chekelin no pudo responder: ${result.error}`);
      } finally {
        setBotTyping(false);
      }
      return;
    }

    const quoting = replyTo && replyTo.conversation_id === selected.id ? replyTo : null;
    setReplyTo(null);
    const result = await sendChatMessage(selected.id, text, null, quoting?.id ?? null);

    if (result.message) {
      appendMessage(result.message);
      bumpConversation(selected.id, result.message.created_at, result.message.body);
    }
    if (result.message) {
      // A person replied: chekelin goes silent and an unassigned chat is
      // now theirs (the database does the same; this is just immediate).
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selected.id
            ? {
                ...c,
                handed_off_at: c.handed_off_at ?? result.message!.created_at,
                assigned_to: c.assigned_to ?? currentUserId,
                awaiting_since: null,
              }
            : c,
        ),
      );
    }
    if (result.sendError) setSendError(result.sendError);
    else if (result.error) setSendError(result.error);
  }

  // A voice note or document went out (or failed): same follow-up as a text
  // reply — show it, move the chat up, and the person now owns the chat.
  function handleMediaResult(result: MediaSendResult) {
    const msg = result.message;
    if (msg && msg.direction === "in") {
      // Modo prueba: the sample customer's file, and chekelin's answer.
      appendMessage(msg);
      bumpConversation(msg.conversation_id, msg.created_at, msg.body);
      if (result.reply) {
        appendMessage(result.reply);
        bumpConversation(result.reply.conversation_id, result.reply.created_at, result.reply.body);
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === msg.conversation_id ? { ...c, window_expires_at: new Date(Date.now() + DAY_MS).toISOString() } : c)),
      );
      setSendError(result.sendError ?? result.error ?? null);
      return;
    }
    if (msg) {
      appendMessage(msg);
      bumpConversation(msg.conversation_id, msg.created_at, msg.body);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversation_id
            ? {
                ...c,
                handed_off_at: c.handed_off_at ?? msg.created_at,
                assigned_to: c.assigned_to ?? currentUserId,
                awaiting_since: null,
              }
            : c,
        ),
      );
    }
    setSendError(result.sendError ?? result.error ?? null);
  }

  // "Ubicación": the Tienda's saved location, as WhatsApp sends it (a map
  // pin) or as a Google Maps link on Instagram / Messenger.
  const locationEntry = selected ? storeLocations[selected.store_id] : undefined;
  const locationPlan =
    selected && locationEntry ? locationSendPlan(selected.channel?.type, locationEntry.location, locationEntry.name) : null;

  async function handleSendLocation() {
    if (!selected || !locationPlan) return;
    setSendingLocation(true);
    setSendError(null);
    try {
      let result: MediaSendResult;
      if (businessId === "demo") {
        const pin = locationPlan.location;
        result = {
          message: {
            id: `demo-loc-${crypto.randomUUID()}`,
            conversation_id: selected.id,
            business_id: "demo",
            direction: "out",
            body: locationPlan.text,
            media_url: null,
            status: "sent",
            is_bot: false,
            created_at: new Date().toISOString(),
            ...(pin
              ? {
                  media_kind: "location" as const,
                  media_info: { latitude: pin.latitude, longitude: pin.longitude, place: pin.name, address: pin.address || undefined },
                }
              : {}),
          },
        };
      } else {
        result = await sendStoreLocation(selected.id);
      }
      handleMediaResult(result);
      if (result.message) setPendingLocation(false);
    } catch {
      setSendError("No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSendingLocation(false);
    }
  }

  // "Copiar" in a bubble's menu.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }
  async function handleCopy(m: Message) {
    setMenuFor(null);
    const text = copyableText(m);
    if (!text) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = copyWithSelection(text);
    }
    showToast(ok ? "Copiado" : "No se pudo copiar");
  }

  async function handleSetStage(stage: ConversationStage) {
    if (!selected) return;
    const id = selected.id;
    const previous = selected.stage;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)));
    // The public /demo only moves it on screen.
    if (businessId === "demo") return;
    let error: string | undefined;
    try {
      error = (await setConversationStage(id, stage)).error;
    } catch {
      error = "No se pudo mover el contacto. Inténtalo de nuevo.";
    }
    if (error) {
      // Not saved: put the stage back and say why.
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, stage: previous } : c)));
      setSendError(error);
    }
  }

  // Per-conversation pause. Turning it back on makes chekelin the first
  // responder here again.
  async function handleToggleBot() {
    if (!selected || chatState === "off" || chatState === "complaint") return;
    const next = chatState === "paused";
    const previous = { bot_enabled: selected.bot_enabled, handed_off_at: selected.handed_off_at, chekelin_replies: selected.chekelin_replies };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? next
            ? { ...c, bot_enabled: true, handed_off_at: null, chekelin_replies: 0 }
            : { ...c, bot_enabled: false }
          : c,
      ),
    );
    const { error } = await setConversationBotEnabled(selected.id, next);
    if (error) {
      // Not saved: put the switch back and say why.
      setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...previous } : c)));
      setSendError(error);
    }
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

  function openPayment() {
    setShowPayment((v) => !v);
    setShowProductPicker(false);
    setShowTemplatePicker(false);
    setShowEmojiPicker(false);
    if (!payInstructions) {
      try {
        setPayInstructions(localStorage.getItem("cheke-pay-instructions") ?? "");
      } catch {
        // storage blocked — start empty
      }
    }
  }

  async function handleSendPayment() {
    if (!selected) return;
    const amount = parseAmount(payAmount);
    if (amount === null) {
      setSendError("Escribe un monto válido, por ejemplo 1250 o 1,250.50");
      return;
    }
    setSendError(null);
    setPayBusy(true);
    try {
      const result = await sendPaymentRequest(selected.id, {
        concept: payConcept,
        amountHnl: amount,
        link: payLink,
        instructions: payInstructions,
      });
      if (result.message) {
        appendMessage(result.message);
        bumpConversation(selected.id, result.message.created_at, result.message.body);
      }
      if (result.order) {
        const order = result.order;
        setOrdersByConversation((prev) => ({ ...prev, [selected.id]: [order, ...(prev[selected.id] ?? [])] }));
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selected.id
              ? { ...c, value_hnl: amount, stage: ["nuevo", "consulta", "cotizacion"].includes(c.stage) ? "negociacion" : c.stage }
              : c,
          ),
        );
      }
      if (result.error) {
        setSendError(result.error);
        return;
      }
      try {
        localStorage.setItem("cheke-pay-instructions", payInstructions);
      } catch {
        // ignore
      }
      setShowPayment(false);
      setPayConcept("");
      setPayAmount("");
      setPayLink("");
    } finally {
      setPayBusy(false);
    }
  }

  async function handleResolveOrder(order: OpenOrder, outcome: "paid" | "cancelled") {
    if (!selected) return;
    // "Confirmar pago" is one tap (the button itself says what it does);
    // cancelling asks first.
    if (outcome === "cancelled" && !confirm(`¿Cancelar el cobro de ${formatAmount(order.total_hnl)}?`)) return;
    const result = await resolveOrder(order.id, outcome);
    if (result.error) {
      setSendError(result.error);
      return;
    }
    setOrdersByConversation((prev) => ({
      ...prev,
      [selected.id]: (prev[selected.id] ?? []).filter((o) => o.id !== order.id),
    }));
    if (outcome === "paid") {
      setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, stage: "ganado" } : c)));
    }
  }

  function handlePickEmoji(emoji: string) {
    setDraft((prev) => prev + emoji);
    draftInputRef.current?.focus();
  }

  async function handleSeed() {
    setSeeding(true);
    setSeedError(null);
    try {
      const result = await seedDemoData();
      if (result.error) setSeedError(result.error);
    } catch {
      setSeedError("No se pudieron crear los datos de ejemplo. Inténtalo de nuevo.");
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
        {seedError && (
          <p role="alert" className="text-[12.5px] text-danger">
            {seedError}
          </p>
        )}
      </div>
    );
  }

  return (
    // The whole Chat screen (list, header, messages, compose bar) uses the
    // phone's system font, like WhatsApp itself, so nothing in a conversation
    // changes typeface mid-screen. Titles with font-heading keep the brand font.
    <div className="flex h-full min-h-0" style={{ fontFamily: WHATSAPP_FONT }}>
      {/* Conversation list — full width on its own below `lg`, a fixed
          resizable column beside the thread at `lg` and up. */}
      <div
        style={{ ["--list-w" as string]: `${listWidth}px`, minWidth: LIST_WIDTH_MIN }}
        className={`${mobileView === "thread" ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-border bg-surface lg:w-[var(--list-w)]`}
      >
        <div className="shrink-0 px-4.5 pb-3 pt-5">
          <div className="mb-3 flex items-center justify-between gap-2 font-heading text-[19px] font-semibold text-ink">
            Chat
            <BrandMark />
          </div>
          {chekelinAvailable && stores.length > 0 && businessId !== "demo" && (
            <ChekelinStoreSwitch
              stores={stores}
              nowMs={now}
              open={showChekelinMenu}
              onOpenChange={setShowChekelinMenu}
              onSet={handleChekelinStore}
              reducedMotion={Boolean(prefersReducedMotion)}
            />
          )}
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
                  : // The raw channel color (WhatsApp's green above all) is too
                    // faint as text on its own tint: darken it toward navy.
                    { background: withAlpha(color, 0.14), borderColor: withAlpha(color, 0.3), color: `color-mix(in srgb, ${color} 55%, #001037)` }
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
            <button
              onClick={() => {
                setUnreadOnly((v) => !v);
                setOpenedId(null);
              }}
              aria-pressed={unreadOnly}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-[5px] text-[12.5px] font-semibold transition-colors ${
                unreadOnly
                  ? "border-brand bg-brand-tint text-brand-dark"
                  : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
              }`}
            >
              No leídos
              {unreadChats > 0 && (
                <span className="min-w-[18px] rounded-full bg-accent px-1 text-center text-[11px] leading-[18px] text-brand-dark">
                  {unreadChats > 99 ? "99+" : unreadChats}
                </span>
              )}
            </button>
          </div>
          {storeNames && <StoreFilter storeNames={storeNames} value={storeFilter} onChange={setStoreFilter} className="mt-2" />}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          {filtered.map((c) => {
            const lastBody = messagesByConversation[c.id]?.at(-1)?.body ?? c.last_message_body;
            const badge = unreadBadge(c.unread_count ?? 0);
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedId(c.id);
                  setOpenedId(c.id);
                  if (c.id !== selectedId) {
                    setReplyTo(null);
                    setNoteMode(false);
                    setPendingLocation(false);
                  }
                  setMenuFor(null);
                  setMobileView("thread");
                  setSendError(null);
                  setShowDetail(false);
                }}
                className={`flex w-full gap-2.5 border-b border-border px-4.5 py-3 text-left ${
                  c.id === selectedId ? "bg-brand-tint" : "bg-surface hover:bg-surface-2"
                }`}
              >
                <div className="relative h-[34px] w-[34px] shrink-0 rounded-full bg-brand text-[12.5px] font-bold leading-none tracking-tight text-white">
                  <span className="flex h-full w-full items-center justify-center">
                    {initialsFor(c.contact.name)}
                  </span>
                  {c.channel && (
                    <ChannelIcon
                      type={c.channel.type}
                      className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full ring-2 ring-surface"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className={`truncate text-[13.5px] text-ink ${badge ? "font-bold" : "font-semibold"}`}>
                      {c.contact.name}
                    </div>
                    <div className={`shrink-0 text-[11px] ${badge ? "font-semibold text-brand-dark" : "text-ink-soft"}`}>
                      {relativeTime(c.last_message_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`min-w-0 flex-1 truncate text-[12.5px] ${badge ? "font-medium text-ink" : "text-ink-muted"}`}>
                      {lastBody ?? ""}
                    </div>
                    {c.complaint_open_at && <ComplaintTag />}
                    {storeNames && <StoreTag name={storeNames[c.store_id]} />}
                    {badge && (
                      <span className="min-w-5 shrink-0 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-brand-dark">
                        {badge}
                        <span className="sr-only"> sin leer</span>
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4.5 py-8 text-center text-[13px] text-ink-soft">
              {unreadOnly && !query.trim() ? "Estás al día: no hay chats sin leer." : "Sin resultados."}
            </div>
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
                onClick={() => {
                  setMobileView("list");
                  setOpenedId(null);
                }}
                aria-label="Volver a la lista de chats"
                className="-ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-muted lg:hidden"
              >
                <BackIcon className="h-4.5 w-4.5" />
              </button>
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-brand text-[13.5px] font-bold text-white">
                {initialsFor(selected.contact.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[14.5px] font-semibold text-ink">{selected.contact.name}</span>
                  {complaintOpen && <ComplaintTag />}
                </div>
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
                {referralLabel(selected) && (
                  <div className="truncate text-xs font-medium text-brand">{referralLabel(selected)}</div>
                )}
              </div>

              {/* On phones the controls drop to their own row under the name; on
                  desktop they sit inline at the right. */}
              <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
              {/* chekelin in this chat: first responder, silent after the
                  Traspaso, paused here by hand, or off in the Tienda. */}
              {chekelinAvailable && (
                <button
                  onClick={handleToggleBot}
                  disabled={chatState === "off" || chatState === "complaint"}
                  title={CHEKELIN_STATE_HINT[chatState]}
                  aria-label={CHEKELIN_STATE_LABEL[chatState]}
                  className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-60 lg:h-[30px] ${
                    chatState === "active"
                      ? "border-accent bg-accent-tint text-brand-dark"
                      : chatState === "silent"
                        ? "border-brand-tint bg-brand-tint text-brand-dark"
                        : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset, not worth next/image's overhead here */}
                  <img src="/logos/cheke-icon-blue.png" alt="" className="h-3.5 w-3.5 object-contain" />
                  <span className="hidden sm:inline">{CHEKELIN_STATE_LABEL[chatState]}</span>
                </button>
              )}

              {/* Demo/testing only — tucked away as a small secondary icon
                  instead of a primary compose-bar button, since real
                  WhatsApp sending doesn't need this; it exists purely to
                  show chekelin's first-reply flow before WhatsApp is live. */}
              {sampleChat && (
              <button
                onClick={() => {
                  setSimulateMode((v) => !v);
                  setSendError(null);
                }}
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
              )}

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

            {/* Team-only strip: who has the chat (2+ people), and an open
                Queja that has no note to show it below. Never sent to the
                customer. */}
            {(showAssignment || complaintWithoutNote) && (
              <div
                className={`shrink-0 border-b border-border bg-surface-2 px-3 py-2 text-[12.5px] lg:px-6 ${
                  highlightAssignment && canReassign ? "ring-2 ring-inset ring-brand" : ""
                }`}
              >
                {complaintWithoutNote && (
                  <div className={`${showAssignment ? "mb-1.5" : ""} flex flex-wrap items-center gap-x-2 gap-y-1`}>
                    <ComplaintTag />
                    <span className="min-w-0 flex-1 text-ink">
                      chekelin no responde hasta que la queja se marque resuelta.
                    </span>
                    {selectedStore?.canManage && (
                      <button
                        onClick={handleResolveComplaint}
                        className="min-h-8 rounded-lg border border-border bg-surface px-3 text-[12px] font-semibold text-ink hover:bg-surface-3"
                      >
                        Marcar queja resuelta
                      </button>
                    )}
                  </div>
                )}
                {showAssignment && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-ink-muted">Lo atiende</span>
                    {canReassign ? (
                      <label className="relative inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-surface pl-2 pr-1.5 font-semibold text-ink">
                        <span className="max-w-[180px] truncate">{assignee?.name ?? "Nadie todavía"}</span>
                        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                        <select
                          value={selected.assigned_to ?? ""}
                          onChange={(e) => handleReassign(e.target.value)}
                          aria-label="Reasignar conversación"
                          // The 10-minute alert lands here: one tap opens the list.
                          autoFocus={highlightAssignment}
                          className="absolute inset-0 h-full w-full cursor-pointer text-[16px] opacity-0"
                        >
                          {!selected.assigned_to && <option value="">Nadie todavía</option>}
                          {assignable.map((p) => (
                            <option key={p.userId} value={p.userId}>
                              {p.name}
                              {p.away ? " (Ausente)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="font-semibold text-ink">{assignee?.name ?? "Nadie todavía"}</span>
                    )}
                    {assignee?.away && <span className="text-ink-soft">· Ausente</span>}
                    {selected.awaiting_since && (
                      <span className="text-danger">· Esperando respuesta desde {formatMessageTime(selected.awaiting_since)}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Team-only notes: one line; a tap opens all of them in a sheet. */}
            <NoteStrip
              key={selected.id}
              notes={selectedNotes}
              authorNames={Object.fromEntries(people.map((p) => [p.userId, p.name]))}
              me={people.find((p) => p.userId === currentUserId) ?? null}
              complaintOpen={complaintOpen}
              onResolveComplaint={selectedStore?.canManage ? handleResolveComplaint : undefined}
            />

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
              {/* An open bubble menu closes on any tap outside it. */}
              {menuFor && (
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setMenuFor(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuFor(null);
                  }}
                />
              )}
              {messages.map((m, i) => {
                const out = m.direction === "out";
                const prev = messages[i - 1];
                // "Hoy", "Ayer", "Jueves"… between days, like WhatsApp.
                const newDay = !prev || !sameDay(prev.created_at, m.created_at);
                // Bubbles from the same side in a row are tight (2px) and only
                // the first gets the pointed corner, like WhatsApp's tail.
                const firstInRun = !prev || prev.direction !== m.direction || newDay;
                const deleted = Boolean(m.deleted_at);
                const hasReaction = !deleted && Boolean(m.reaction_in || m.reaction_out);
                // Only while the composer can send (not in test mode).
                const canAnswer = !sendBlocked && !simulateMode;
                const emojis = simulateMode ? [] : reactionChoices(selected.channel?.type);
                // "Copiar" works even when nothing can be sent.
                const copyText = deleted ? null : copyableText(m);
                return (
                  <div
                    key={m.id}
                    id={`msg-${m.id}`}
                    className={`flex flex-col ${out ? "items-end" : "items-start"} ${i === 0 ? "" : firstInRun ? "mt-2" : "mt-[2px]"} ${
                      menuFor === m.id ? "relative z-30" : ""
                    }`}
                  >
                    {newDay && (
                      <div
                        role="separator"
                        className={`${i === 0 ? "mb-2" : "mb-2 mt-1"} self-center rounded-[7.5px] bg-white/95 px-3 py-[5px] text-[12px] font-medium text-[#54656F] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]`}
                      >
                        {dayLabel(m.created_at, now)}
                      </div>
                    )}
                    {m.is_bot && !(prev && prev.is_bot && prev.source === m.source && !newDay) && (
                      <div className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-brand-dark">
                        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
                        <img src="/logos/cheke-icon-blue.png" alt="" className="h-3 w-3 object-contain" />
                        {m.source === "broadcast" ? "Difusión" : botLabel}
                      </div>
                    )}
                    {m.source === "phone" && !(prev && prev.source === "phone") && (
                      <div className="mb-0.5 px-1 text-[11px] font-semibold text-ink-muted">Desde el teléfono</div>
                    )}
                    {m.source === "meta_app" && !(prev && prev.source === "meta_app") && (
                      <div className="mb-0.5 px-1 text-[11px] font-semibold text-ink-muted">
                        {selected.channel?.type === "instagram" ? "Desde Instagram" : "Desde Facebook"}
                      </div>
                    )}
                    <SwipeToReply
                      enabled={touchScreen && !deleted && (canAnswer || Boolean(copyText))}
                      swipe={canAnswer}
                      onReply={() => startReply(m)}
                      onLongPress={() => setMenuFor(m.id)}
                      className={`group max-w-[82%] lg:max-w-[65%] ${hasReaction ? "mb-[18px]" : ""}`}
                    >
                    <div
                      onContextMenu={(e) => {
                        if (deleted || touchScreen) return;
                        e.preventDefault();
                        setMenuFor(m.id);
                      }}
                      className={`relative max-w-full rounded-[7.5px] px-[9px] pb-[7px] pt-[6px] text-[14.2px] leading-[19px] text-[#111B21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] transition-shadow ${
                        out ? "bg-[#D9FDD3]" : "bg-white"
                      } ${firstInRun ? (out ? "rounded-tr-none" : "rounded-tl-none") : ""} ${
                        flashId === m.id ? "ring-2 ring-[#53BDEB]" : ""
                      }`}
                    >
                      {/* Mouse screens: a small arrow on hover opens the menu. */}
                      {!touchScreen && !deleted && (canAnswer || emojis.length > 0 || Boolean(copyText)) && (
                        <button
                          type="button"
                          onClick={() => setMenuFor(m.id)}
                          aria-label="Opciones del mensaje"
                          className={`absolute right-1 top-1 z-[1] flex h-5 w-5 items-center justify-center rounded-full ${
                            out ? "bg-[#D9FDD3]" : "bg-white"
                          } text-[#667781] opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100`}
                        >
                          <ChevronDownIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <MessageMenu
                        open={menuFor === m.id}
                        out={out}
                        below={i < 2}
                        emojis={sendBlocked ? [] : emojis}
                        current={m.reaction_out}
                        canReply={canAnswer}
                        onReply={() => startReply(m)}
                        onCopy={copyText ? () => handleCopy(m) : null}
                        onReact={(emoji) => handleReact(m, emoji)}
                        onClose={() => setMenuFor(null)}
                      />
                      {deleted ? (
                        <div className="flow-root">
                          <DeletedBody />
                          <span className="float-right -mb-[3px] ml-2 mt-[5px] select-none text-[11px] leading-[15px] text-[#667781]">
                            {formatMessageTime(m.created_at)}
                          </span>
                        </div>
                      ) : (
                      <>
                      {m.reply_to_id && (
                        <QuotedMessage
                          quoted={messagesById.get(m.reply_to_id)}
                          contactName={selected.contact.name}
                          onJump={jumpToMessage}
                        />
                      )}
                      {m.media_url && !m.media_kind && (
                        // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL sent as part of a product message
                        <img
                          src={m.media_url}
                          alt=""
                          className="-mx-1 mb-1 mt-0.5 max-h-48 w-[calc(100%+8px)] rounded-md object-cover"
                        />
                      )}
                      <MessageMedia message={m} />
                      <div className="flow-root whitespace-pre-line break-words">
                        {mediaReplacesBody(m) ? m.media_info?.caption : m.body}
                        {/* Floats into the end of the last line; if there's no
                            room it drops below — that's what keeps short
                            messages in a short bubble. */}
                        <span className="float-right -mb-[3px] ml-2 mt-[5px] inline-flex select-none items-center gap-[3px] text-[11px] leading-[15px] text-[#667781]">
                          {m.edited_at && <span>Editado</span>}
                          {formatMessageTime(m.created_at)}
                          {out && <MessageStatusIcon status={effectiveStatus(m)} />}
                        </span>
                      </div>
                      </>
                      )}
                      <ReactionChips
                        message={m}
                        onRemoveOwn={emojis.length > 0 && !sendBlocked ? () => handleReact(m, null) : undefined}
                      />
                    </div>
                    </SwipeToReply>
                    {out && m.status === "failed" && (
                      <FailedNotice
                        message={m}
                        retrying={retryingId === m.id}
                        onRetry={sendBlocked ? null : () => handleRetry(m)}
                        open={openFailureId === m.id}
                        onToggle={() => setOpenFailureId((id) => (id === m.id ? null : m.id))}
                        reducedMotion={Boolean(prefersReducedMotion)}
                      />
                    )}
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
            {sendBlocked &&
              (selected.channel?.type === "whatsapp" ? (
                // WhatsApp after 24 h: only an approved template can go out.
                <WhatsAppTemplateSender
                  key={selected.id}
                  open={templateSenderFor === selected.id}
                  onOpenChange={(next) => setTemplateSenderFor(next ? selected.id : null)}
                  conversationId={selected.id}
                  contactName={selected.contact.name}
                  demo={businessId === "demo"}
                  onSent={handleMediaResult}
                  phoneHint={selected.channel?.coexistence ? WHATSAPP_PHONE_APP_HINT : null}
                />
              ) : (
                <div className="shrink-0 border-t border-danger-border bg-danger-tint px-4 py-2 text-[12.5px] text-danger lg:px-6">
                  {windowClosedMessage(selected.channel?.type)}
                </div>
              ))}
            {replyState === "human_agent" && !simulateMode && selected.channel && (
              <div className="shrink-0 border-t border-border bg-surface-2 px-4 py-2 text-[12.5px] text-ink-muted lg:px-6">
                {humanAgentNotice(selected.channel.type)}
              </div>
            )}
            {simulateMode && !pendingProduct && (
              <div className="shrink-0 border-t border-accent bg-accent-tint px-4 py-1.5 lg:px-6 text-[12px] font-semibold text-brand-dark">
                Modo prueba: escribes, grabas notas de voz y mandas fotos como si fueras el cliente, para ver cómo responde chekelin. No le llega nada a nadie.
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
            {pendingLocation && !sendBlocked && !simulateMode && (
              <div className="flex shrink-0 items-center gap-3 border-t border-accent bg-accent-tint px-4 py-2.5 lg:px-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-dark">
                  <PinIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  {locationPlan && locationEntry ? (
                    <>
                      <div className="truncate text-[12.5px] font-semibold text-brand-dark">
                        Ubicación de {locationEntry.name}
                      </div>
                      <div className="truncate text-[11.5px] text-brand-dark/80">
                        {locationPlan.location ? "Le llega como un mapa" : "Le llega como un link de Google Maps"}
                        {locationEntry.location.address ? ` · ${locationEntry.location.address}` : ""}
                      </div>
                    </>
                  ) : (
                    <div className="text-[12.5px] leading-snug text-brand-dark">
                      Todavía no guardaste la ubicación de la tienda.{" "}
                      <Link
                        href={businessId === "demo" ? "/demo/app/chekelin" : "/chekelin"}
                        className="font-semibold underline underline-offset-2"
                      >
                        Agrégala en «Lo que chekelin sabe»
                      </Link>
                    </div>
                  )}
                </div>
                {locationPlan && (
                  <button
                    onClick={handleSendLocation}
                    disabled={sendingLocation}
                    className="min-h-9 shrink-0 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
                  >
                    {sendingLocation ? "Enviando…" : "Enviar"}
                  </button>
                )}
                <button
                  onClick={() => setPendingLocation(false)}
                  aria-label="Cancelar envío de ubicación"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-brand-dark"
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {(ordersByConversation[selected.id] ?? []).map((order) => (
              <div
                key={order.id}
                className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border bg-accent-tint px-4 py-2 lg:px-6 ${
                  highlightOrderId === order.id ? "ring-2 ring-inset ring-brand" : ""
                }`}
              >
                <div className="min-w-0 flex-1 text-[12.5px] text-ink">
                  <span className="font-semibold">
                    {order.receipt_at ? "Comprobante recibido" : "Cobro pendiente"} · {formatAmount(order.total_hnl)}
                  </span>
                  {order.concept && <span className="text-ink-muted"> — {order.concept}</span>}
                  {order.by_chekelin && <span className="text-ink-muted"> · pedido tomado por chekelin</span>}
                  {order.receipt_at && (
                    <span className="block text-ink-muted">Revisa que el dinero entró y confirma: la venta pasa a Ganado.</span>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => handleResolveOrder(order, "paid")}
                    autoFocus={highlightOrderId === order.id}
                    className="min-h-8 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white"
                  >
                    Confirmar pago
                  </button>
                  <button
                    onClick={() => handleResolveOrder(order, "cancelled")}
                    className="min-h-8 rounded-lg border border-border bg-surface px-3 text-[12px] text-ink-muted"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
            <AnimatePresence initial={false}>
              {noteMode && <NoteComposerBar key="note" onCancel={() => setNoteMode(false)} />}
              {replyTo && replyTo.conversation_id === selected.id && !sendBlocked && !simulateMode && !noteMode && (
                <ReplyBar
                  key="reply"
                  message={replyTo}
                  contactName={selected.contact.name}
                  onCancel={() => setReplyTo(null)}
                />
              )}
            </AnimatePresence>
            {composerMedia.strip}
            <div className="relative flex shrink-0 items-end gap-1.5 border-t border-border bg-surface px-3 py-2.5 sm:gap-2 lg:px-6 lg:py-3.5">
              {noteMode ? mentionPicker.picker : quickReplyPicker.picker}
              {composerMedia.inputs}
              {/* Phones and tablets: one "+" opens WhatsApp's attach sheet.
                  Computers keep the inline buttons of design/Inbox.html. */}
              <button
                type="button"
                onClick={() => {
                  setShowProductPicker(false);
                  setShowTemplatePicker(false);
                  setShowPayment(false);
                  setShowAttach(true);
                }}
                aria-label="Adjuntar: foto, cámara, documento, producto, cobro…"
                aria-haspopup="dialog"
                aria-expanded={showAttach}
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 lg:hidden"
              >
                <PlusIcon className="h-[22px] w-[22px]" />
              </button>
              <div className="hidden lg:contents">
                {composerMedia.attachButton}
                {composerMedia.photoButton}
              </div>
              <div className="relative max-lg:contents">
                <button
                  onClick={() => setShowProductPicker((v) => !v)}
                  title="Enviar un producto del catálogo"
                  aria-pressed={showProductPicker}
                  className={`hidden h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors lg:flex ${
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
                      className="absolute bottom-[46px] left-0 z-10 max-lg:bottom-[calc(100%+6px)] max-lg:left-3 w-56 rounded-[10px] border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,16,55,0.14)]"
                    >
                      <div className="px-2 py-1 text-[11px] text-ink-soft">Enviar producto del catálogo…</div>
                      <div className="max-h-56 overflow-y-auto">
                        {storeProducts.length === 0 && (
                          <div className="px-2 py-1.5 text-[12.5px] text-ink-soft">
                            Todavía no tienes productos en el catálogo.
                          </div>
                        )}
                        {storeProducts.map((p) => (
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
              <div className="relative max-lg:contents">
                <button
                  onClick={() =>
                    approvedTemplateOnly
                      ? setTemplateSenderFor((id) => (id === selected.id ? null : selected.id))
                      : setShowTemplatePicker((v) => !v)
                  }
                  disabled={sendBlocked && !approvedTemplateOnly}
                  title={approvedTemplateOnly ? "Enviar una plantilla aprobada de WhatsApp" : "Usar una plantilla"}
                  aria-pressed={approvedTemplateOnly ? templateSenderFor === selected.id : showTemplatePicker}
                  className={`hidden lg:flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
                    showTemplatePicker
                      ? "border-brand bg-brand-tint text-brand-dark"
                      : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                  }`}
                >
                  <TemplateIcon className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {showTemplatePicker && !sendBlocked && (
                    <motion.div
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                      className="absolute bottom-[46px] left-0 z-10 max-lg:bottom-[calc(100%+6px)] max-lg:left-3 w-64 rounded-[10px] border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,16,55,0.14)]"
                    >
                      <div className="px-2 py-1 text-[11px] text-ink-soft">Usar una plantilla…</div>
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
              <div className="relative max-lg:contents">
                <button
                  onClick={openPayment}
                  disabled={sendBlocked || simulateMode || businessId === "demo"}
                  title="Cobrar: enviar un link de pago o datos para pagar"
                  aria-pressed={showPayment}
                  className={`hidden lg:flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
                    showPayment
                      ? "border-brand bg-brand-tint text-brand-dark"
                      : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                  }`}
                >
                  <CardIcon className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {showPayment && (
                    <motion.div
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                      className="absolute bottom-[46px] left-0 z-10 max-lg:bottom-[calc(100%+6px)] max-lg:left-3 flex w-[290px] max-w-[calc(100vw-24px)] flex-col gap-2 rounded-[10px] border border-border bg-surface p-3 shadow-[0_8px_24px_rgba(0,16,55,0.14)]"
                    >
                      <div className="text-[12.5px] font-semibold text-ink">Cobrar al cliente</div>
                      <input
                        value={payConcept}
                        onChange={(e) => setPayConcept(e.target.value)}
                        placeholder="Concepto (ej. Pedido de 2 camisas)"
                        maxLength={120}
                        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
                      />
                      <input
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="Monto en Lempiras (ej. 1250)"
                        inputMode="decimal"
                        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
                      />
                      <input
                        value={payLink}
                        onChange={(e) => setPayLink(e.target.value)}
                        placeholder="Link de pago (https://…)"
                        inputMode="url"
                        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
                      />
                      <textarea
                        value={payInstructions}
                        onChange={(e) => setPayInstructions(e.target.value)}
                        placeholder="O datos para transferir (banco, cuenta, nombre)"
                        rows={3}
                        maxLength={500}
                        className="resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
                      />
                      <p className="text-[11px] leading-snug text-ink-soft">
                        Cheke no cobra por ti: el cliente paga en tu banco o plataforma. Aquí solo envías el link y llevas el control.
                      </p>
                      <button
                        onClick={handleSendPayment}
                        disabled={payBusy}
                        className="min-h-10 rounded-lg bg-brand text-[13px] font-semibold text-white disabled:opacity-60"
                      >
                        {payBusy ? "Enviando…" : "Enviar cobro"}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button
                onClick={() => setPendingLocation((v) => !v)}
                disabled={sendBlocked || simulateMode}
                title="Enviar la ubicación de la tienda"
                aria-pressed={pendingLocation}
                className={`hidden lg:flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
                  pendingLocation
                    ? "border-brand bg-brand-tint text-brand-dark"
                    : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                }`}
              >
                <PinIcon className="h-4 w-4" />
              </button>
              {/* Phones have emoji on their own keyboard: the button only takes
                  room the message box needs. */}
              <div className="relative hidden lg:block">
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
              <button
                type="button"
                onClick={() => {
                  setNoteMode((v) => !v);
                  draftInputRef.current?.focus();
                }}
                disabled={businessId === "demo"}
                title="Nota para el equipo: el cliente no la ve"
                aria-label="Nota para el equipo"
                aria-pressed={noteMode}
                className={`hidden lg:flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
                  noteMode ? "border-brand bg-accent-tint text-brand-dark" : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                }`}
              >
                <NoteIcon className="h-4 w-4" />
              </button>
              <textarea
                ref={draftInputRef}
                rows={1}
                disabled={sendBlocked && !noteMode}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (noteMode ? mentionPicker.onKeyDown(e) : quickReplyPicker.onKeyDown(e)) return;
                  // Enter sends; Shift+Enter starts a new line.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  noteMode
                    ? mentionable.length > 0
                      ? "Nota para el equipo (@ para mencionar)"
                      : "Nota para el equipo"
                    : sendBlocked
                    ? selected.channel?.type === "whatsapp" || !selected.channel
                      ? "Ventana de 24 h cerrada"
                      : "Ventana de 7 días cerrada"
                    : pendingProduct
                    ? "Agrega un mensaje (opcional)…"
                    : simulateMode
                      ? "Escribe como si fueras el cliente…"
                      : quickReplies.length > 0
                        ? "Escribe un mensaje o /atajo"
                        : "Escribe un mensaje"
                }
                className={`max-h-[140px] min-w-0 flex-1 resize-none rounded-[22px] border px-3.5 py-2.5 text-[13.5px] leading-[18px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint ${
                  noteMode ? "border-accent bg-accent-tint" : "border-border bg-surface-2"
                }`}
              />
              {/* WhatsApp-style: while the box is empty, phones get the camera
                  and the mic takes Send's place. The mic is always there; when
                  nothing can be sent (window closed) it is grey
                  and says why when tapped. */}
              {!noteMode && !draft.trim() && !pendingProduct && !composerMedia.hasPendingVisual && !composerMedia.recording && (
                <div className="flex lg:hidden">{composerMedia.cameraButton}</div>
              )}
              {!noteMode && (composerMedia.recording || (!draft.trim() && !pendingProduct && !composerMedia.hasPendingVisual)) ? (
                composerMedia.micButton
              ) : (
                <button
                  onClick={handleSend}
                  disabled={noteMode ? sendingNote || !draft.trim() : botTyping || sendingProduct || sendBlocked}
                  aria-label={noteMode ? "Guardar nota" : "Enviar"}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-60"
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <AttachSheet
              open={showAttach}
              onClose={() => setShowAttach(false)}
              footnote={mediaBlockedReason}
              options={[
                {
                  key: "camera",
                  label: "Cámara",
                  tint: "#001037",
                  icon: <CameraIcon className="h-6 w-6" />,
                  onSelect: composerMedia.openCamera,
                  disabled: composerMedia.pickBlocked,
                },
                {
                  key: "gallery",
                  label: "Fotos y videos",
                  tint: "#0043F8",
                  icon: <PhotoIcon className="h-6 w-6" />,
                  onSelect: composerMedia.openGallery,
                  disabled: composerMedia.pickBlocked,
                },
                {
                  key: "document",
                  label: "Documento",
                  tint: "#7C5CFF",
                  icon: <ClipIcon className="h-6 w-6" />,
                  onSelect: composerMedia.openDocument,
                  disabled: composerMedia.pickBlocked,
                },
                {
                  key: "location",
                  label: "Ubicación",
                  tint: "#C2410C",
                  icon: <PinIcon className="h-6 w-6" />,
                  onSelect: () => setPendingLocation(true),
                  disabled: sendBlocked || simulateMode,
                },
                {
                  key: "product",
                  label: "Producto del catálogo",
                  tint: "#0E7C86",
                  icon: <BoxIcon className="h-6 w-6" />,
                  onSelect: () => setShowProductPicker(true),
                },
                {
                  key: "payment",
                  label: "Cobrar",
                  tint: "#1F8A4C",
                  icon: <CardIcon className="h-6 w-6" />,
                  onSelect: openPayment,
                  disabled: sendBlocked || simulateMode || businessId === "demo",
                },
                {
                  key: "quick",
                  label: "Respuesta rápida",
                  tint: "#B45309",
                  icon: <BoltIcon className="h-6 w-6" />,
                  onSelect: () => {
                    setDraft((d) => (d.trim() ? `${d.replace(/\s+$/, "")} /` : "/"));
                    window.setTimeout(() => draftInputRef.current?.focus(), 0);
                  },
                  disabled: sendBlocked || simulateMode,
                },
                {
                  key: "note",
                  label: "Nota para el equipo",
                  tint: "#001037",
                  icon: <NoteIcon className="h-6 w-6" />,
                  onSelect: () => {
                    setNoteMode(true);
                    window.setTimeout(() => draftInputRef.current?.focus(), 0);
                  },
                  disabled: businessId === "demo",
                },
                {
                  key: "template",
                  label: "Plantilla",
                  tint: "#5B6B8C",
                  icon: <TemplateIcon className="h-6 w-6" />,
                  // Closed WhatsApp window: open "Enviar plantilla" (approved
                  // templates only); filling the disabled text box is useless.
                  onSelect: () =>
                    approvedTemplateOnly ? setTemplateSenderFor(selected.id) : setShowTemplatePicker(true),
                  disabled: sendBlocked && !approvedTemplateOnly,
                },
              ]}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13.5px] text-ink-soft">
            Selecciona una conversación
          </div>
        )}
      </div>

      {/* "Copiado": a short note at the bottom, gone on its own. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast}
              role="status"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
              className="rounded-full bg-brand-dark px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(0,16,55,0.24)]"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
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
                {referralLabel(selected) && (
                  <div className="font-medium text-brand">
                    {selected.referral_url ? (
                      <a href={selected.referral_url} target="_blank" rel="noopener noreferrer" className="underline">
                        {referralLabel(selected)}
                      </a>
                    ) : (
                      referralLabel(selected)
                    )}
                  </div>
                )}
              </div>

              <ContactTags
                key={selected.contact.id}
                contactId={selected.contact.id}
                tags={selected.contact.tags ?? []}
                suggestions={tagSuggestions}
                onSaved={(tags) =>
                  setConversations((prev) =>
                    prev.map((c) => (c.contact_id === selected.contact.id ? { ...c, contact: { ...c.contact, tags } } : c)),
                  )
                }
              />

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

// chekelin's switch for the Tienda(s) on screen: off for 1 hour, until
// tomorrow, 1 week or until turned back on. Dueños and Gerentes change it;
// Agentes only see it.
function ChekelinStoreSwitch({
  stores,
  nowMs,
  open,
  onOpenChange,
  onSet,
  reducedMotion,
}: {
  stores: ChekelinStore[];
  nowMs: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSet: (storeId: string, duration: ChekelinOffDuration | null) => void;
  reducedMotion: boolean;
}) {
  const offCount = stores.filter((s) => isChekelinOff(s.offUntil, nowMs)).length;
  const several = stores.length > 1;
  const label =
    offCount === 0
      ? "chekelin encendido"
      : several && offCount < stores.length
        ? `chekelin apagado en ${offCount} tienda${offCount === 1 ? "" : "s"}`
        : "chekelin apagado";
  return (
    <div className="relative mb-3">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className={`flex min-h-9 items-center gap-2 rounded-lg border px-2.5 text-[12.5px] font-semibold transition-colors lg:min-h-8 ${
          offCount === 0 ? "border-accent bg-accent-tint text-brand-dark" : "border-border bg-surface-2 text-ink-muted"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${offCount === 0 ? "bg-accent" : "bg-ink-soft"}`} aria-hidden />
        {label}
        <ChevronDownIcon className="h-3.5 w-3.5 text-ink-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={reducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
            className="absolute left-0 top-[calc(100%+6px)] z-20 flex w-[300px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-[12px] border border-border bg-surface p-3.5 shadow-[0_8px_24px_rgba(0,16,55,0.14)]"
          >
            <p className="text-[12px] leading-snug text-ink-muted">
              chekelin atiende y vende: responde, toma el pedido y manda los datos de pago. Pasa el chat a una persona
              cuando hace falta.{" "}
              <Link href="/chekelin" className="font-semibold text-brand">
                Lo que chekelin sabe de tu negocio
              </Link>
            </p>
            {stores.map((s) => {
              const off = isChekelinOff(s.offUntil, nowMs);
              return (
                <div key={s.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">{several ? s.name : "En tu tienda"}</span>
                    <span className={`shrink-0 text-[11.5px] ${off ? "text-ink-muted" : "font-semibold text-brand-dark"}`}>
                      {off && s.offUntil ? chekelinOffLabel(s.offUntil, nowMs) : "Encendido"}
                    </span>
                  </div>
                  {!s.canManage ? (
                    <p className="text-[11.5px] text-ink-soft">Solo el dueño o el gerente puede apagarlo.</p>
                  ) : off ? (
                    <button
                      onClick={() => onSet(s.id, null)}
                      className="min-h-9 rounded-lg bg-brand text-[12.5px] font-semibold text-white"
                    >
                      Encender ahora
                    </button>
                  ) : (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Apagar chekelin en ${s.name}`}>
                      <span className="w-full text-[11.5px] text-ink-soft">
                        Apagar (los chats que atiende pasan a una persona):
                      </span>
                      {CHEKELIN_OFF_OPTIONS.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => onSet(s.id, o.id)}
                          className="min-h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-[12px] font-semibold text-ink hover:bg-surface-3"
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// The red "Queja" tag: an open complaint (chekelin silent until resolved).
const NO_NOTES: ConversationNote[] = [];

function ComplaintTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-danger-border bg-danger-tint px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-danger">
      Queja
    </span>
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
// Under a failed outgoing message: a red "No entregado" marker (like
// WhatsApp's red triangle) that shows Meta's reason in plain Spanish on
// hover (title) or tap. A billing problem also links to Meta's Billing Hub.
function FailedNotice({
  message,
  retrying,
  onRetry,
  open,
  onToggle,
  reducedMotion,
}: {
  message: Message;
  retrying: boolean;
  // "Reintentar" (null when nothing can be sent right now).
  onRetry: (() => void) | null;
  open: boolean;
  onToggle: () => void;
  reducedMotion: boolean;
}) {
  const reason = message.error_reason ?? explainWhatsAppError(message.error_code);
  const billing = isBillingError(message.error_code);
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        title={reason}
        aria-expanded={open}
        className="mt-0.5 flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] font-semibold text-danger hover:underline"
      >
        <AlertIcon className="h-3.5 w-3.5" />
        No entregado · {open ? "Ocultar" : "Ver motivo"}
      </button>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="-mt-0.5 flex min-h-7 items-center gap-1 rounded px-1 text-[11.5px] font-semibold text-brand hover:underline disabled:opacity-60"
        >
          {retrying ? "Reintentando…" : "Reintentar"}
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
            className="mt-0.5 max-w-[82%] rounded-md border border-danger-border bg-danger-tint px-2.5 py-1.5 text-[12.5px] leading-snug text-danger lg:max-w-[65%]"
            role="status"
          >
            {reason}
            {billing && (
              <>
                {" "}
                <a href={META_BILLING_HUB_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  Abrir Billing Hub de Meta
                </a>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
function NoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}
function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
    </svg>
  );
}
function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}
// WhatsApp-style delivery ticks: one gray check (sent), two gray checks
// (delivered), two blue checks (read), a red alert for a failed send (the
// reason shows under the bubble, see FailedNotice).
function MessageStatusIcon({ status }: { status: Message["status"] }) {
  if (status === "failed") return <AlertIcon className="h-3.5 w-3.5 text-danger" />;
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

function CardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

// Older browsers and some in-app web views refuse navigator.clipboard.
function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
