import type { SupabaseClient } from "@supabase/supabase-js";
import { decideComment, productRefs } from "@/lib/ai";
import {
  classifyCommentByKeywords,
  commentsFromPayload,
  defaultPrivateReply,
  defaultPublicReply,
  isMetaRateLimitError,
  privateReplyBudget,
  privateReplyExpired,
  PRIVATE_REPLY_MAX_ATTEMPTS,
  type CommentKind,
  type CommentPlatform,
  type IncomingComment,
} from "@/lib/comments";
import { fetchPostInfo, metaCredentialsForChannel, replyToComment, sendCommentPrivateReply } from "@/lib/metaMessaging";
import { firstNameForUser, managersOf, notifyAllOwners, openComplaintFromComment } from "@/lib/bot";
import { sendPushToPeople } from "@/lib/push";
import { canUseChekelin } from "@/lib/plan";
import { recordChekelinUsage } from "@/lib/chekelinAllowance";
import { isChekelinOff } from "@/lib/chekelinState";
import { formatLempiras } from "@/lib/format";
import { EMPTY_CHEKELIN_INFO, type ChekelinInfo } from "@/lib/types";

// Comentarios (issue #43; design: issue #40 closing comment). Server-only,
// always with the service-role client (the Meta webhook, the every-minute
// cron job, or a server action after it checked the person's access).
//
//   1. saveIncomingComments: the webhook saves each new customer comment.
//   2. processComments (after answering Meta): chekelin reads it.
//      - precio / info: a short public reply, and a private reply with the
//        price (and the product photo) that opens a chat in Chat, where
//        chekelin keeps selling when the customer answers.
//      - negative: a kind public reply, a private reply that moves it to a
//        private chat with the complaint flow (Queja), and an urgent alert
//        to the Tienda's Gerente (else the Dueño).
//      - anything else: nothing automatic; it's in Comentarios.
//   3. drainPrivateReplies: private replies go through a queue, because
//      Meta allows 750 per hour per account.
// Comments are never hidden or deleted.

type Admin = SupabaseClient;

type ChannelRow = {
  id: string;
  business_id: string;
  store_id: string;
  type: CommentPlatform;
  external_id: string;
  page_id: string | null;
  access_token_encrypted: string | null;
};
const CHANNEL_COLUMNS = "id, business_id, store_id, type, external_id, page_id, access_token_encrypted";

type CommentRecord = {
  id: string;
  business_id: string;
  store_id: string;
  channel_id: string;
  platform: CommentPlatform;
  external_comment_id: string;
  post_external_id: string | null;
  post_caption: string | null;
  author_external_id: string | null;
  author_name: string;
  author_username: string | null;
  body: string;
  commented_at: string;
  kind: CommentKind | null;
  team_summary: string | null;
  handled_at: string | null;
  public_replied_at: string | null;
  private_status: string;
  private_body: string | null;
  private_media_url: string | null;
  private_attempts: number;
  private_sent_by: string | null;
  conversation_id: string | null;
};

// ---------------------------------------------------------------------------
// 1. Webhook: save new comments (fast; Meta waits for our 200)
// ---------------------------------------------------------------------------

// Returns the ids of the comments saved now (redeliveries are skipped).
export async function saveIncomingComments(supabase: Admin, payload: unknown): Promise<string[]> {
  const incoming = commentsFromPayload(payload);
  if (incoming.length === 0) return [];
  const saved: string[] = [];
  const channels = new Map<string, ChannelRow | null>();

  for (const comment of incoming) {
    try {
      const key = `${comment.platform}:${comment.accountId}`;
      if (!channels.has(key)) channels.set(key, await connectedChannel(supabase, comment.platform, comment.accountId));
      const channel = channels.get(key);
      // Nobody has this Page / Instagram account connected (anymore).
      if (!channel) continue;
      const id = await insertComment(supabase, channel, comment);
      if (id) saved.push(id);
    } catch (error) {
      console.error("comment save error", comment.commentId, error);
    }
  }
  return saved;
}

async function connectedChannel(supabase: Admin, type: CommentPlatform, externalId: string): Promise<ChannelRow | null> {
  const { data } = await supabase
    .from("channels")
    .select(CHANNEL_COLUMNS)
    .eq("type", type)
    .eq("external_id", externalId)
    .eq("status", "connected")
    .limit(1)
    .maybeSingle<ChannelRow>();
  return data ?? null;
}

async function insertComment(supabase: Admin, channel: ChannelRow, c: IncomingComment): Promise<string | null> {
  const { data, error } = await supabase
    .from("post_comments")
    .insert({
      business_id: channel.business_id,
      store_id: channel.store_id,
      channel_id: channel.id,
      platform: c.platform,
      external_comment_id: c.commentId,
      parent_external_id: c.parentId,
      post_external_id: c.postId,
      author_external_id: c.authorId,
      author_name: c.authorName,
      author_username: c.authorUsername,
      body: c.text,
      commented_at: c.commentedAt,
    })
    .select("id")
    .single();
  if (error) {
    // 23505 = Meta redelivered it (or two deliveries at once).
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return data.id as string;
}

// ---------------------------------------------------------------------------
// 2. chekelin reads each comment and answers
// ---------------------------------------------------------------------------

export async function processComments(supabase: Admin, ids: string[]): Promise<void> {
  const channels = new Set<string>();
  for (const id of ids) {
    try {
      const channelId = await processComment(supabase, id);
      if (channelId) channels.add(channelId);
    } catch (error) {
      console.error("comment processing error", id, error);
    }
  }
  // The private replies just queued go out now, within the hourly limit.
  for (const channelId of channels) await drainPrivateReplies(supabase, { channelId });
}

// Returns the channel id when a private reply was queued.
async function processComment(supabase: Admin, id: string): Promise<string | null> {
  // Claim it: never handled twice (webhook redelivery, cron catch-up).
  const { data: claimed } = await supabase
    .from("post_comments")
    .update({ handled_at: new Date().toISOString() })
    .eq("id", id)
    .is("handled_at", null)
    .select("*")
    .maybeSingle<CommentRecord>();
  if (!claimed) return null;
  const comment = claimed;

  const [{ data: channel }, { data: store }, { data: business }] = await Promise.all([
    supabase.from("channels").select(CHANNEL_COLUMNS).eq("id", comment.channel_id).maybeSingle<ChannelRow>(),
    supabase.from("stores").select("chekelin_off_until").eq("id", comment.store_id).maybeSingle(),
    supabase.from("businesses").select("name, plan, is_demo").eq("id", comment.business_id).maybeSingle(),
  ]);
  if (!channel) return null;
  const credentials = metaCredentialsForChannel(channel);

  // The post: to show it, and to know which product they ask about.
  if (comment.post_external_id && !comment.post_caption) {
    const post = await fetchPostInfo(comment.platform, comment.post_external_id, credentials);
    if (post.caption || post.permalink || post.imageUrl) {
      comment.post_caption = post.caption ?? null;
      await supabase
        .from("post_comments")
        .update({ post_caption: post.caption ?? null, post_permalink: post.permalink ?? null, post_image_url: post.imageUrl ?? null })
        .eq("id", comment.id);
    }
  }

  const chekelinOn =
    canUseChekelin(business?.plan ?? "") && !isChekelinOff(store?.chekelin_off_until ?? null, Date.now()) && business?.is_demo !== true;

  const managers = await managersOf(supabase, comment.business_id, comment.store_id);
  const managerName = await firstNameForUser(supabase, managers[0] ?? null);

  if (!chekelinOn) {
    // Nobody answers automatically: the badges in Comentarios, and the
    // urgent alert for a negative comment.
    const kind = classifyCommentByKeywords(comment.body);
    await supabase.from("post_comments").update({ kind }).eq("id", comment.id);
    if (kind === "complaint") await alertComplaint(supabase, comment, managers, "");
    return null;
  }

  // chekelin's reading (the keyword reading and fixed texts if the AI fails).
  const [{ data: products }, { data: infoRow }] = await Promise.all([
    supabase.from("products").select("*").eq("store_id", comment.store_id).eq("visible", true).order("created_at"),
    supabase
      .from("store_chekelin_info")
      // "*": the Tipo de negocio and horario (migration 0049) only once they exist.
      .select("*")
      .eq("store_id", comment.store_id)
      .maybeSingle(),
  ]);
  const refs = productRefs(products ?? []);
  const info = { ...EMPTY_CHEKELIN_INFO, ...(infoRow ?? {}) } as ChekelinInfo;

  let kind: CommentKind;
  let publicReply: string | null;
  let privateReply: string | null;
  let summary = "";
  let product = null as (typeof refs)[number]["product"] | null;

  const { decision, error, usage } = await decideComment({
    businessName: business?.name ?? "el negocio",
    info,
    refs,
    managerName,
    platform: comment.platform,
    postCaption: comment.post_caption,
    comment: comment.body,
  });
  await recordChekelinUsage(supabase, { businessId: comment.business_id, storeId: comment.store_id, kind: "comment" }, usage);
  if (decision) {
    kind = decision.kind;
    product = decision.productRef ? (refs.find((r) => r.ref === decision.productRef)?.product ?? null) : null;
    publicReply = decision.publicReply || defaultPublicReply(kind);
    privateReply =
      decision.privateReply ||
      defaultPrivateReply(kind, { product: product ? { name: product.name, price: formatLempiras(product.price_hnl) } : null, managerName });
    summary = decision.teamSummary;
  } else {
    console.error("chekelin comment error", error);
    kind = classifyCommentByKeywords(comment.body);
    publicReply = defaultPublicReply(kind);
    privateReply = defaultPrivateReply(kind, { managerName });
  }

  await supabase.from("post_comments").update({ kind, team_summary: summary || null }).eq("id", comment.id);
  if (kind === "other") return null;

  // The public reply, right away.
  if (publicReply) await postPublicReply(supabase, comment, channel, publicReply, null);

  // The urgent alert for a negative comment, right away too (the private
  // chat may wait in the queue).
  if (kind === "complaint") await alertComplaint(supabase, comment, managers, summary);

  // The private reply goes to the queue (sent right after, within the limit).
  if (privateReply && !comment.conversation_id) {
    await supabase
      .from("post_comments")
      .update({
        private_status: "queued",
        private_body: privateReply,
        // A product photo only for precio / info.
        private_media_url: kind === "price" ? (product?.image_url ?? null) : null,
        private_error: null,
      })
      .eq("id", comment.id)
      .eq("private_status", "none");
    return channel.id;
  }
  return null;
}

async function postPublicReply(
  supabase: Admin,
  comment: Pick<CommentRecord, "id" | "platform" | "external_comment_id">,
  channel: ChannelRow,
  text: string,
  by: string | null,
): Promise<{ error?: string }> {
  const result = await replyToComment(comment.platform, comment.external_comment_id, text, metaCredentialsForChannel(channel));
  if (result.error) {
    await supabase.from("post_comments").update({ public_reply_error: result.error }).eq("id", comment.id);
    return { error: result.error };
  }
  await supabase
    .from("post_comments")
    .update({
      public_reply_body: text,
      public_reply_external_id: result.externalId ?? null,
      public_replied_at: new Date().toISOString(),
      public_replied_by: by,
      public_reply_error: null,
    })
    .eq("id", comment.id);
  return {};
}

// 🔴 to the Tienda's Gerentes (else the Dueños) and Dueños with "avisarme de
// todo", opening Comentarios.
async function alertComplaint(supabase: Admin, comment: CommentRecord, managers: string[], summary: string): Promise<void> {
  const people = new Set(managers);
  for (const owner of await notifyAllOwners(supabase, comment.business_id)) people.add(owner);
  const network = comment.platform === "instagram" ? "Instagram" : "Facebook";
  await sendPushToPeople(supabase, comment.business_id, comment.store_id, [...people], {
    title: `🔴 Comentario negativo en ${network}${comment.author_name ? ` de ${comment.author_name}` : ""}`,
    body: summary || `"${comment.body.slice(0, 120)}"`,
    url: "/comments",
  });
}

// ---------------------------------------------------------------------------
// 3. The private-reply queue
// ---------------------------------------------------------------------------

// A claimed reply whose sender died is retried after this.
const STALE_CLAIM_MS = 5 * 60 * 1000;

// Sends queued private replies, each channel within Meta's hourly limit.
// Safe to run twice at once: each reply is claimed before it is sent.
export async function drainPrivateReplies(
  supabase: Admin,
  { channelId, limit = 200, deadlineMs = Date.now() + 45_000 }: { channelId?: string; limit?: number; deadlineMs?: number } = {},
): Promise<{ sent: number }> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  let query = supabase
    .from("post_comments")
    .select("id, channel_id")
    .or(`private_status.eq.queued,and(private_status.eq.sending,private_claimed_at.lt."${staleBefore}")`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (channelId) query = query.eq("channel_id", channelId);
  const { data: rows, error } = await query;
  if (error) {
    console.error("private reply queue error", error);
    return { sent: 0 };
  }

  const byChannel = new Map<string, string[]>();
  for (const row of rows ?? []) byChannel.set(row.channel_id, [...(byChannel.get(row.channel_id) ?? []), row.id]);

  let sent = 0;
  for (const [channel, ids] of byChannel) {
    const { data: count } = await supabase.rpc("comment_private_replies_sent_last_hour", { p_channel_id: channel });
    let budget = privateReplyBudget(Number(count ?? 0));
    for (const id of ids) {
      if (budget <= 0 || Date.now() > deadlineMs) break;
      const outcome = await sendQueuedPrivateReply(supabase, id, staleBefore);
      if (outcome === "sent") {
        sent += 1;
        budget -= 1;
      } else if (outcome === "rate_limited") {
        break; // Meta says wait: the rest of this channel stays queued.
      }
    }
  }
  return { sent };
}

async function sendQueuedPrivateReply(
  supabase: Admin,
  id: string,
  staleBefore: string,
): Promise<"sent" | "failed" | "rate_limited" | "skipped"> {
  const { data: comment } = await supabase
    .from("post_comments")
    .update({ private_status: "sending", private_claimed_at: new Date().toISOString() })
    .eq("id", id)
    .or(`private_status.eq.queued,and(private_status.eq.sending,private_claimed_at.lt."${staleBefore}")`)
    .select("*")
    .maybeSingle<CommentRecord>();
  if (!comment || !comment.private_body) return "skipped";

  if (privateReplyExpired(comment.commented_at, Date.now())) {
    await supabase
      .from("post_comments")
      .update({ private_status: "expired", private_error: "Meta solo deja escribir por privado hasta 7 días después del comentario." })
      .eq("id", id);
    return "failed";
  }

  const { data: channel } = await supabase.from("channels").select(CHANNEL_COLUMNS).eq("id", comment.channel_id).maybeSingle<ChannelRow>();
  const credentials = metaCredentialsForChannel(channel);
  const card = comment.private_media_url ? { imageUrl: comment.private_media_url, title: cardTitle(comment) } : null;
  const result = await sendCommentPrivateReply(comment.external_comment_id, comment.private_body, credentials, card);

  if (result.error) {
    const rateLimited = isMetaRateLimitError(result.code);
    const attempts = comment.private_attempts + (rateLimited ? 0 : 1);
    await supabase
      .from("post_comments")
      .update({
        private_status: rateLimited || attempts < PRIVATE_REPLY_MAX_ATTEMPTS ? "queued" : "failed",
        private_attempts: attempts,
        private_error: result.error,
        private_claimed_at: null,
      })
      .eq("id", id);
    return rateLimited ? "rate_limited" : "failed";
  }

  const sentAt = new Date().toISOString();
  await supabase
    .from("post_comments")
    .update({ private_status: "sent", private_sent_at: sentAt, private_error: null, private_claimed_at: null })
    .eq("id", id);

  // The chat in Chat: the customer's answer lands in it and chekelin (or a
  // person) continues there.
  if (channel && result.recipientId) {
    try {
      const conversationId = await recordPrivateReplyInChat(supabase, comment, channel, result.recipientId, {
        text: comment.private_body,
        mediaUrl: result.asText ? null : comment.private_media_url,
        externalMessageId: result.externalMessageId ?? null,
        sentAt,
      });
      await supabase.from("post_comments").update({ conversation_id: conversationId }).eq("id", id);
      if (comment.kind === "complaint") {
        await openComplaintFromComment(
          supabase,
          conversationId,
          comment.team_summary || `Comentario negativo en una publicación: "${comment.body.slice(0, 200)}"`,
          // The Gerente was already alerted about the comment.
          { alert: false },
        );
      }
    } catch (error) {
      console.error("private reply chat error", id, error);
    }
  }
  return "sent";
}

function cardTitle(comment: CommentRecord): string {
  return comment.post_caption?.split("\n")[0]?.trim() || "Tu consulta";
}

// Finds or creates the Contacto (by the id Meta gave the private reply's
// recipient, the same one its DMs will come from) and the Conversación, and
// saves the private reply in it.
async function recordPrivateReplyInChat(
  supabase: Admin,
  comment: CommentRecord,
  channel: ChannelRow,
  recipientId: string,
  message: { text: string; mediaUrl: string | null; externalMessageId: string | null; sentAt: string },
): Promise<string> {
  const column = channel.type === "instagram" ? "ig_id" : "fb_psid";
  const lookup = () =>
    supabase
      .from("contacts")
      .select("id")
      .eq("business_id", channel.business_id)
      .eq(column, recipientId)
      .limit(1)
      .maybeSingle<{ id: string }>();

  let contactId = (await lookup()).data?.id ?? null;
  if (!contactId) {
    const fallback = channel.type === "instagram" ? "Cliente de Instagram" : "Cliente de Facebook";
    const { data: created, error } = await supabase
      .from("contacts")
      .insert({
        business_id: channel.business_id,
        name: comment.author_name || fallback,
        [column]: recipientId,
        ...(comment.author_username ? { ig_handle: `@${comment.author_username}` } : {}),
      })
      .select("id")
      .single();
    if (created) contactId = created.id as string;
    else if (error?.code === "23505") contactId = (await lookup()).data?.id ?? null;
    if (!contactId) throw new Error(error?.message ?? "No se pudo crear el contacto.");
  }

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("business_id", channel.business_id)
    .eq("contact_id", contactId)
    .eq("channel_id", channel.id)
    .order("created_at", { ascending: true })
    .limit(1);
  let conversationId = (existing?.[0]?.id as string | undefined) ?? null;
  if (!conversationId) {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        business_id: channel.business_id,
        store_id: channel.store_id,
        contact_id: contactId,
        channel_id: channel.id,
        status: "open",
        // Asked about a product under a post.
        ...(comment.kind === "price" ? { stage: "consulta" } : {}),
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "No se pudo crear la conversación.");
    conversationId = created.id as string;
  }

  const byPerson = Boolean(comment.private_sent_by);
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    business_id: channel.business_id,
    direction: "out",
    body: message.text,
    media_url: message.mediaUrl,
    is_bot: !byPerson,
    status: "sent",
    external_message_id: message.externalMessageId,
    created_at: message.sentAt,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  await supabase.from("conversations").update({ last_message_at: message.sentAt }).eq("id", conversationId);
  return conversationId;
}

// ---------------------------------------------------------------------------
// From the Comentarios screen (the caller checked the person's access)
// ---------------------------------------------------------------------------

export async function answerCommentPublicly(
  supabase: Admin,
  commentId: string,
  text: string,
  userId: string,
): Promise<{ error?: string }> {
  const { data: comment } = await supabase
    .from("post_comments")
    .select("id, platform, external_comment_id, channel_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) return { error: "No se encontró el comentario." };
  const { data: channel } = await supabase.from("channels").select(CHANNEL_COLUMNS).eq("id", comment.channel_id).maybeSingle<ChannelRow>();
  if (!channel) return { error: "Este canal ya no está conectado." };
  return postPublicReply(supabase, comment as CommentRecord, channel, text, userId);
}

// "Enviar por privado": a person writes the private reply. Only one per
// comment (Meta), so not when chekelin already sent it.
export async function answerCommentPrivately(
  supabase: Admin,
  commentId: string,
  text: string,
  userId: string,
): Promise<{ error?: string; conversationId?: string | null }> {
  const { data: queued } = await supabase
    .from("post_comments")
    .update({
      private_status: "queued",
      private_body: text,
      private_media_url: null,
      private_sent_by: userId,
      private_attempts: 0,
      private_error: null,
    })
    .eq("id", commentId)
    .in("private_status", ["none", "queued", "failed"])
    .select("id, channel_id")
    .maybeSingle();
  if (!queued) return { error: "A esta persona ya se le escribió por privado (Meta solo permite un mensaje por comentario)." };

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: count } = await supabase.rpc("comment_private_replies_sent_last_hour", { p_channel_id: queued.channel_id });
  if (privateReplyBudget(Number(count ?? 0)) <= 0) return {}; // stays queued; the cron sends it
  await sendQueuedPrivateReply(supabase, commentId, staleBefore);

  const { data: after } = await supabase
    .from("post_comments")
    .select("private_status, private_error, conversation_id")
    .eq("id", commentId)
    .maybeSingle();
  if (after?.private_status === "failed" || (after?.private_status === "queued" && after.private_error)) {
    return { error: after.private_error ?? "Meta no aceptó el mensaje." };
  }
  return { conversationId: after?.conversation_id ?? null };
}

// The cron's catch-up: comments the webhook saved but never got to handle
// (the function was stopped). Only recent ones; an old answer would confuse.
export async function processMissedComments(supabase: Admin): Promise<number> {
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("post_comments")
    .select("id")
    .is("handled_at", null)
    .gt("created_at", from)
    .lt("created_at", to)
    .order("created_at")
    .limit(20);
  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length > 0) await processComments(supabase, ids);
  return ids.length;
}
