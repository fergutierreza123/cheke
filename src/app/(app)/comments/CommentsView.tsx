"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BrandMark } from "@/components/BrandMark";
import { StoreTag } from "@/components/StoreTag";
import { initialsFor, relativeTime } from "@/lib/format";
import type { CommentPlatform, CommentRow } from "@/lib/comments";
import { replyToCommentPrivately, replyToCommentPublicly } from "./actions";

// Comentarios (issue #43), layout from design/Comments.html (the visual
// redesign is on hold): filters, three counters, and one card per comment
// with the reply under it.

type ChannelFilter = "todos" | CommentPlatform;

const CHANNEL_LABEL: Record<CommentPlatform, string> = { instagram: "Instagram", facebook: "Facebook" };
const CHANNEL_DOT: Record<CommentPlatform, string> = { instagram: "bg-ig", facebook: "bg-fb" };

export function CommentsView({
  comments,
  storeNames,
  businessName,
}: {
  comments: CommentRow[];
  storeNames: Record<string, string> | null;
  businessName: string;
}) {
  const [channel, setChannel] = useState<ChannelFilter>("todos");
  const [priceOnly, setPriceOnly] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const replied = (c: CommentRow) => Boolean(c.public_replied_at || c.private_status === "sent");
  const filtered = useMemo(
    () => comments.filter((c) => (channel === "todos" || c.platform === channel) && (!priceOnly || c.kind === "price")),
    [comments, channel, priceOnly],
  );
  const priceUnanswered = comments.filter((c) => c.kind === "price" && !replied(c)).length;
  const repliedCount = comments.filter(replied).length;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-surface px-4 py-3.5 lg:min-h-[72px] lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-3">
        <div className="min-w-0">
          <h1 className="text-display flex items-center justify-between gap-2 font-heading text-xl font-semibold text-ink">
            Comentarios
            <span className="lg:hidden">
              <BrandMark />
            </span>
          </h1>
          <p className="text-[13.5px] text-ink-muted">
            Lo que te preguntan en tus publicaciones
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {(["todos", "instagram", "facebook"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setChannel(channel === id ? "todos" : id)}
              className="chip"
              aria-pressed={channel === id}
            >
              {id === "todos" ? "Todos" : CHANNEL_LABEL[id]}
            </button>
          ))}
          <button
            onClick={() => setPriceOnly((v) => !v)}
            className="chip"
            aria-pressed={priceOnly}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Solo preguntas de precio
          </button>
        </div>
      </div>

      <div className="flex shrink-0 gap-3 px-4 pt-4 lg:px-8">
        <Counter value={comments.length} label="comentarios" />
        <Counter value={priceUnanswered} label="precios sin responder" danger />
        <Counter value={repliedCount} label="ya respondidos" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 lg:px-8">
        <div className="flex max-w-[820px] flex-col gap-3">
          {filtered.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              storeName={storeNames?.[c.store_id]}
              businessName={businessName}
              onToast={setToast}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-[60px] text-center text-[13px] text-ink-soft">
              {comments.length === 0
                ? "Todavía no hay comentarios. Cuando alguien comente en tus publicaciones de Instagram o Facebook, aparece aquí."
                : "No hay comentarios con estos filtros."}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={reduceMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
            className="absolute bottom-6 left-1/2 z-20 flex w-[calc(100%-32px)] max-w-[480px] -translate-x-1/2 items-center gap-2.5 rounded-xl bg-brand-dark px-[18px] py-3 text-white shadow-[0_12px_32px_rgba(0,16,55,0.3)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={toast.ok ? "var(--accent)" : "#F6BFBF"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
              {toast.ok ? <path d="M20 6L9 17l-5-5" /> : <path d="M12 8v5M12 16v.01" />}
            </svg>
            <div className="flex-1 text-[12.5px] leading-snug">{toast.text}</div>
            <button onClick={() => setToast(null)} aria-label="Cerrar" className="shrink-0 text-[#A9B1CC]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Counter({ value, label, danger = false }: { value: number; label: string; danger?: boolean }) {
  return (
    <div className="flex-1 rounded-xl border border-border bg-surface px-4 py-3">
      <div className={`font-heading text-[19px] font-bold ${danger ? "text-danger" : "text-ink"}`}>{value}</div>
      <div className="text-[11.5px] text-ink-muted">{label}</div>
    </div>
  );
}

function CommentCard({
  comment: c,
  storeName,
  businessName,
  onToast,
}: {
  comment: CommentRow;
  storeName: string | undefined;
  businessName: string;
  onToast: (toast: { ok: boolean; text: string }) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const name = c.author_name || (c.author_username ? `@${c.author_username}` : "Cliente");
  const caption = c.post_caption?.split("\n")[0]?.trim();
  const network = CHANNEL_LABEL[c.platform];
  const privateDone = c.private_status === "sent";
  const privateWaiting = c.private_status === "queued" || c.private_status === "sending";
  const canPrivate = !privateDone && !privateWaiting && c.private_status !== "expired";

  function replyPublic() {
    const text = draft.trim();
    if (!text || pending) return;
    startTransition(async () => {
      const result = await replyToCommentPublicly(c.id, text);
      if (result.error) return onToast({ ok: false, text: result.error });
      setDraft("");
      onToast({ ok: true, text: `Respondiste el comentario de ${name} en ${network}.` });
      router.refresh();
    });
  }

  function replyPrivate() {
    const text = draft.trim();
    if (pending) return;
    if (!text) return onToast({ ok: false, text: "Escribe el mensaje en la caja y toca “Enviar por privado”." });
    startTransition(async () => {
      const result = await replyToCommentPrivately(c.id, text);
      if (result.error) return onToast({ ok: false, text: result.error });
      setDraft("");
      onToast({
        ok: true,
        text: result.conversationId
          ? `Le escribiste a ${name} por privado. La conversación sigue en Chat.`
          : `El mensaje para ${name} quedó en cola y sale en unos minutos.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface px-[18px] py-4">
      <div className="flex gap-3">
        <PostThumb imageUrl={c.post_image_url} caption={caption} permalink={c.post_permalink} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${CHANNEL_DOT[c.platform]}`} />
            <div className="truncate text-[11.5px] text-ink-muted">
              {network}
              {caption ? ` · publicación “${caption.slice(0, 60)}”` : ""} · {relativeTime(c.commented_at)}
            </div>
            {storeName && <StoreTag name={storeName} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
              {initialsFor(name.replace(/^@/, "")) || "?"}
            </div>
            <div className="text-[13.5px] font-bold text-ink">{name}</div>
            {c.kind === "price" && <Badge tone="danger">Pregunta de precio</Badge>}
            {c.kind === "complaint" && <Badge tone="danger">Queja</Badge>}
            {(c.public_replied_at || privateDone) && <Badge tone="mint">Respondido</Badge>}
          </div>
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-[1.45] text-ink">{c.body}</div>
          {c.kind === "complaint" && c.team_summary && (
            <div className="mt-1.5 text-[12px] text-ink-muted">Para el equipo: {c.team_summary}</div>
          )}
        </div>
      </div>

      {c.public_reply_body && (
        <div className="ml-16 rounded-[10px] bg-surface-2 px-3 py-2.5 text-[13px] text-ink">
          <span className="font-bold text-brand-dark">{businessName}:</span> {c.public_reply_body}
          {!c.public_replied_by && <span className="ml-1 text-[11.5px] text-ink-muted">· chekelin</span>}
        </div>
      )}
      {c.public_reply_error && !c.public_reply_body && (
        <div className="ml-16 text-[12px] text-danger">No se pudo responder en público. Inténtalo de nuevo.</div>
      )}

      <PrivateLine comment={c} name={name} />

      <div className="ml-0 flex flex-col gap-2 sm:ml-16 sm:flex-row sm:items-center">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              replyPublic();
            }
          }}
          placeholder="Responder en público…"
          aria-label={`Responder a ${name}`}
          className="min-h-10 flex-1 rounded-full border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-ink outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={replyPublic}
            disabled={pending}
            className="min-h-10 flex-1 whitespace-nowrap rounded-full bg-brand-dark px-3.5 text-[12px] font-semibold text-white disabled:opacity-60 sm:flex-none"
          >
            Responder
          </button>
          {canPrivate && (
            <button
              onClick={replyPrivate}
              disabled={pending}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3.5 text-[12px] font-semibold text-brand-dark disabled:opacity-60 sm:flex-none"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.5-.3-3.6-.8L3 21l1.8-5.4A8.5 8.5 0 1 1 21 11.5z" />
              </svg>
              Enviar por privado
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// What happened with the private reply.
function PrivateLine({ comment: c, name }: { comment: CommentRow; name: string }) {
  if (c.private_status === "none") return null;
  let text: string;
  let tone = "text-ink-muted";
  if (c.private_status === "sent") text = `Se le escribió por privado a ${name}`;
  else if (c.private_status === "queued" || c.private_status === "sending") text = "Mensaje privado en cola: sale en unos minutos";
  else if (c.private_status === "expired") text = "Ya pasaron 7 días: Meta no deja escribirle por privado";
  else {
    text = `No se pudo escribir por privado${c.private_error ? `: ${c.private_error}` : ""}`;
    tone = "text-danger";
  }
  return (
    <div className={`ml-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] sm:ml-16 ${tone}`}>
      <span>{text}</span>
      {c.private_body && c.private_status === "sent" && (
        <span className="text-ink-soft">“{c.private_body.length > 90 ? `${c.private_body.slice(0, 89)}…` : c.private_body}”</span>
      )}
      {c.conversation_id && (
        <Link href={`/chat?c=${c.conversation_id}`} className="font-semibold text-brand">
          Ver en Chat ›
        </Link>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "danger" | "mint"; children: React.ReactNode }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-md px-[7px] py-0.5 text-[10.5px] font-bold ${
        tone === "danger" ? "bg-danger-tint text-danger" : "bg-accent-tint text-brand-dark"
      }`}
    >
      {children}
    </span>
  );
}

function PostThumb({ imageUrl, caption, permalink }: { imageUrl: string | null; caption: string | undefined; permalink: string | null }) {
  const code = initialsFor(caption ?? "") || "P";
  const inner = imageUrl ? (
    // Meta's picture link (expires after a while): a plain <img>, no optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
  ) : (
    <span className="font-heading text-[14px] font-bold text-brand-dark">{code}</span>
  );
  const box = "flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-brand-tint";
  return permalink ? (
    <a href={permalink} target="_blank" rel="noopener noreferrer" className={box} aria-label="Ver la publicación">
      {inner}
    </a>
  ) : (
    <div className={box}>{inner}</div>
  );
}
