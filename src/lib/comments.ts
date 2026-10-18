// Comentarios (issue #43; design: issue #40 closing comment). The pure part:
// reading Meta's comment webhooks, a keyword reading of a comment (used when
// chekelin isn't available), the default texts and the private-reply rate
// limit. No server imports, so the screen and tests can use it too.

export type CommentPlatform = "instagram" | "facebook";
// 'price' = precio / info; 'complaint' = a negative comment (Queja);
// 'other' = anything else (nobody answers automatically).
export type CommentKind = "price" | "complaint" | "other";

// Meta allows 750 private replies per hour per account; we stop a bit
// before, and the rest wait in the queue (drained every minute).
export const PRIVATE_REPLIES_PER_HOUR = 750;
export const PRIVATE_REPLIES_SAFE_LIMIT = 700;
// A private reply can only be sent within 7 days of the comment.
export const PRIVATE_REPLY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Tries before a private reply is marked failed.
export const PRIVATE_REPLY_MAX_ATTEMPTS = 3;

export const PUBLIC_REPLY_MAX = 1000;
export const PRIVATE_REPLY_MAX = 1000;

// One customer comment, as cheke needs it.
export type IncomingComment = {
  platform: CommentPlatform;
  // The Instagram account id / Facebook Page id (= channels.external_id).
  accountId: string;
  commentId: string;
  // The comment it answers, when it's a reply inside a thread.
  parentId: string | null;
  postId: string | null;
  authorId: string | null;
  authorName: string;
  authorUsername: string | null;
  text: string;
  commentedAt: string;
};

type Change = { field?: string; value?: Record<string, unknown> };
type Payload = { object?: string; entry?: Array<{ id?: string; time?: number; changes?: Change[] }> };

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : typeof value === "number" ? String(value) : null;
}

// Meta sends Unix seconds in comment webhooks (milliseconds in messaging).
function timeOf(value: unknown, fallback: Date): string {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback.toISOString();
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

// The new customer comments in a webhook payload: Instagram (object
// "instagram", field "comments") and Facebook Pages (object "page", field
// "feed", item "comment", verb "add"). Comments written by the account
// itself (its own replies, including cheke's) are left out; edits, removals,
// reactions and new posts too.
export function commentsFromPayload(payload: unknown, now = new Date()): IncomingComment[] {
  const p = (payload ?? {}) as Payload;
  const platform: CommentPlatform | null = p.object === "instagram" ? "instagram" : p.object === "page" ? "facebook" : null;
  if (!platform) return [];
  const out: IncomingComment[] = [];

  for (const entry of p.entry ?? []) {
    const accountId = str(entry.id);
    if (!accountId) continue;
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const from = (v.from ?? {}) as Record<string, unknown>;
      const authorId = str(from.id);
      if (authorId === accountId) continue;

      if (platform === "instagram" && change.field === "comments") {
        const commentId = str(v.id);
        const text = str(v.text);
        if (!commentId || text === null) continue;
        const media = (v.media ?? {}) as Record<string, unknown>;
        const username = str(from.username);
        out.push({
          platform,
          accountId,
          commentId,
          parentId: str(v.parent_id),
          postId: str(media.id),
          authorId,
          authorName: username ? `@${username}` : "",
          authorUsername: username,
          text,
          commentedAt: timeOf(entry.time, now),
        });
      } else if (platform === "facebook" && change.field === "feed") {
        if (v.item !== "comment" || v.verb !== "add") continue;
        const commentId = str(v.comment_id);
        const text = str(v.message) ?? "";
        if (!commentId) continue;
        const postId = str(v.post_id);
        const parentId = str(v.parent_id);
        out.push({
          platform,
          accountId,
          commentId,
          // A comment straight on the post has the post as its parent.
          parentId: parentId && parentId !== postId ? parentId : null,
          postId,
          authorId,
          authorName: str(from.name) ?? "",
          authorUsername: null,
          text,
          commentedAt: timeOf(v.created_time ?? entry.time, now),
        });
      }
    }
  }
  return out;
}

// Words of a negative comment (checked before price: "¿cuánto más hay que
// esperar? nunca me llegó" is a complaint).
const COMPLAINT_RE =
  /(estaf|fraude|ladr[oó]n|robo|p[eé]sim|mal[ií]sim|horrible|mal servicio|mala atenci[oó]n|mala calidad|no me lleg[oó]|nunca (me )?lleg|no lleg[oó]|no responden|no contestan|nadie responde|decepci|queja|reclamo|devuelv|reembolso|me enga[nñ]|da[nñ]ad|roto|rota\b|no sirve|no recomiendo|no compren|cuidado con)/i;

// Words of a precio / info comment.
const PRICE_RE =
  /(precio|price|cu[aá]nto|cuesta|vale\b|valor|costo|lps?\b|lempiras|\binfo\b|informaci[oó]n|inbox|\bdm\b|\bmd\b|privado|interesa|disponible|talla|colou?r|env[ií]o|entregas?|lo quiero|la quiero|los quiero|las quiero|me lo das|pedido|ordenar|comprar)/i;

// A reading of the comment without AI: used when chekelin isn't available
// (plan, switched off) or the AI failed, for the badges in Comentarios and
// the complaint alert.
export function classifyCommentByKeywords(text: string): CommentKind {
  const t = text.trim();
  if (!t) return "other";
  if (COMPLAINT_RE.test(t)) return "complaint";
  if (PRICE_RE.test(t)) return "price";
  return "other";
}

// The short public replies (#40: "¡Te escribimos por mensaje! 💬").
export function defaultPublicReply(kind: CommentKind): string | null {
  if (kind === "price") return "¡Te escribimos por mensaje! 💬";
  if (kind === "complaint") return "Sentimos mucho lo que pasó. Te escribimos por mensaje para ayudarte personalmente.";
  return null;
}

// The private reply when the AI can't write it.
export function defaultPrivateReply(
  kind: CommentKind,
  input: { product?: { name: string; price: string } | null; managerName?: string | null },
): string | null {
  if (kind === "price") {
    return input.product
      ? `¡Hola! Vimos tu comentario 😊 ${input.product.name} está en ${input.product.price}. ¿Te interesa? Contame y te ayudo por aquí.`
      : "¡Hola! Vimos tu comentario 😊 ¿Qué producto te interesó? Por aquí te paso precio y fotos.";
  }
  if (kind === "complaint") {
    const who = input.managerName ?? "la persona encargada";
    return `Hola, vimos tu comentario y queremos ayudarte. ¿Nos contás qué pasó y de qué pedido se trata? ${who} va a ver tu caso personalmente y te responde lo antes posible.`;
  }
  return null;
}

// How many queued private replies a channel may send now.
export function privateReplyBudget(sentLastHour: number, limit = PRIVATE_REPLIES_SAFE_LIMIT): number {
  return Math.max(0, limit - Math.max(0, sentLastHour));
}

// Meta's errors that mean "too many for now": the reply stays queued.
export function isMetaRateLimitError(code: number | undefined): boolean {
  return code === 4 || code === 17 || code === 32 || code === 613 || code === 80002 || code === 80006;
}

export function privateReplyExpired(commentedAt: string, nowMs: number): boolean {
  return nowMs - new Date(commentedAt).getTime() > PRIVATE_REPLY_MAX_AGE_MS;
}

// What the Comentarios screen shows for each comment.
export type CommentRow = {
  id: string;
  store_id: string;
  platform: CommentPlatform;
  post_caption: string | null;
  post_permalink: string | null;
  post_image_url: string | null;
  author_name: string;
  author_username: string | null;
  body: string;
  commented_at: string;
  kind: CommentKind | null;
  team_summary: string | null;
  public_reply_body: string | null;
  public_replied_at: string | null;
  public_replied_by: string | null;
  public_reply_error: string | null;
  private_status: "none" | "queued" | "sending" | "sent" | "failed" | "expired";
  private_body: string | null;
  private_sent_at: string | null;
  private_error: string | null;
  conversation_id: string | null;
};

export const COMMENT_ROW_COLUMNS =
  "id, store_id, platform, post_caption, post_permalink, post_image_url, author_name, author_username, body, commented_at, kind, team_summary, public_reply_body, public_replied_at, public_replied_by, public_reply_error, private_status, private_body, private_sent_at, private_error, conversation_id";
