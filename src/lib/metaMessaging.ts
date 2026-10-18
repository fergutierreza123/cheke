import { decryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";

// Server-only. Instagram DMs and Facebook Messenger, both through the
// business's Facebook Page (Messenger Platform, Facebook Login for Business).
// One Send API for both: POST /{page-id}/messages with the Page's token; the
// recipient is the customer's Instagram-scoped id (IGSID) or Page-scoped id
// (PSID), which the webhook stores on the contact.

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Fields each Page is subscribed to after connecting. `feed` is for
// Comentarios (comments on the Page's posts, issue #43); reactions and edits show on the
// bubbles (issue #51). Instagram's own fields are set once for the whole app
// in the Meta App Dashboard.
export const PAGE_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_echoes",
  "message_deliveries",
  "message_reads",
  "message_reactions",
  "message_edits",
  "feed",
];
// Nice to have: if Meta refuses them, the Page still connects without them.
export const PAGE_OPTIONAL_FIELDS = ["feed", "message_reactions", "message_edits"];

export type MetaCredentials = { pageId: string; accessToken: string };

type ChannelRow =
  | { external_id: string | null; page_id?: string | null; access_token_encrypted: string | null }
  | null
  | undefined;

// The Page + token an Instagram or Facebook channel sends through.
export function metaCredentialsForChannel(channel: ChannelRow): MetaCredentials | null {
  const pageId = channel?.page_id ?? channel?.external_id;
  if (!pageId || !channel?.access_token_encrypted) return null;
  try {
    return { pageId, accessToken: decryptSecret(channel.access_token_encrypted) };
  } catch (error) {
    console.error("meta: could not decrypt channel token", error);
    return null;
  }
}

export async function postMessage(
  credentials: MetaCredentials,
  body: Record<string, unknown>,
): Promise<MetaSendResult> {
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${encodeURIComponent(credentials.pageId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { error: "No se pudo contactar a Meta. Revisa tu conexión e inténtalo de nuevo." };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const graphError = data?.error
      ? { code: data.error.code, error_subcode: data.error.error_subcode, message: data.error.message }
      : undefined;
    return { error: data?.error?.message ?? "Meta no aceptó el mensaje.", graphError };
  }
  return { externalMessageId: data?.message_id };
}

// `graphError` is Meta's own error (code / subcode), so the caller can tell
// a broken connection ("Reconectar") from a normal refusal.
export type MetaSendResult = {
  externalMessageId?: string;
  error?: string;
  graphError?: { code?: number; error_subcode?: number; message?: string };
};

// Sends a text (and, before it, a photo when `mediaUrl` is given: Messenger
// and Instagram have no photo captions). `humanAgent` marks a reply typed by
// a person 24 h – 7 days after the customer's last message (HUMAN_AGENT tag);
// it must never be set for chekelin or any automation. `replyToMid` quotes
// one of the customer's messages ("Responder").
export async function sendMetaMessage(
  recipientId: string,
  text: string,
  credentials: MetaCredentials | null,
  {
    mediaUrl,
    humanAgent = false,
    replyToMid,
  }: { mediaUrl?: string | null; humanAgent?: boolean; replyToMid?: string | null } = {},
): Promise<MetaSendResult> {
  if (!credentials) return { error: "Este canal no está conectado. Vuelve a conectarlo en Canales." };

  const routing = humanAgent
    ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
    : { messaging_type: "RESPONSE" };
  const recipient = { id: recipientId };

  if (mediaUrl) {
    const photo = await postMessage(credentials, {
      recipient,
      ...routing,
      message: { attachment: { type: "image", payload: { url: mediaUrl, is_reusable: false } } },
    });
    if (photo.error) return photo;
  }
  if (replyToMid) {
    const quoted = await postMessage(credentials, { recipient, ...routing, message: { text, reply_to: { mid: replyToMid } } });
    // If Meta won't quote that message, still send the text on its own.
    if (!quoted.error) return quoted;
  }
  return postMessage(credentials, { recipient, ...routing, message: { text } });
}

// Instagram: the business reacts to a customer's message with a heart, or
// takes it back (emoji null). Messenger has no API to react.
export async function sendMetaReaction(
  recipientId: string,
  mid: string,
  emoji: string | null,
  credentials: MetaCredentials | null,
): Promise<{ error?: string }> {
  if (!credentials) return { error: "Este canal no está conectado. Vuelve a conectarlo en Canales." };
  const result = await postMessage(
    credentials,
    emoji
      ? { recipient: { id: recipientId }, sender_action: "react", payload: { message_id: mid, reaction: "love" } }
      : { recipient: { id: recipientId }, sender_action: "unreact", payload: { message_id: mid } },
  );
  return result.error ? { error: result.error } : {};
}

// Marks the customer's messages as seen (Messenger / Instagram). Best effort.
export async function sendMetaSeen(recipientId: string, credentials: MetaCredentials | null): Promise<void> {
  if (!credentials || !recipientId) return;
  await postMessage(credentials, { recipient: { id: recipientId }, sender_action: "mark_seen" }).catch(() => undefined);
}

// Shows "escribiendo…" to the customer on Messenger / Instagram (sender
// action typing_on). Best effort: a failure here never matters.
export async function sendMetaTyping(recipientId: string, credentials: MetaCredentials | null): Promise<void> {
  if (!credentials || !recipientId) return;
  await postMessage(credentials, { recipient: { id: recipientId }, sender_action: "typing_on" }).catch(() => undefined);
}

// The customer's name (and Instagram username) for a new contact. Best
// effort: Meta only shares it while the conversation is active, and the
// contact is created anyway with a generic name if this fails.
export async function fetchMetaProfile(
  channelType: "instagram" | "facebook",
  customerId: string,
  credentials: MetaCredentials | null,
): Promise<{ name?: string; username?: string }> {
  if (!credentials) return {};
  const fields = channelType === "instagram" ? "name,username" : "first_name,last_name";
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(customerId)}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return {};
    const data = await res.json().catch(() => null);
    if (channelType === "instagram") return { name: data?.name || undefined, username: data?.username || undefined };
    const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ");
    return { name: name || undefined };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Comentarios (issue #43): comments under the Tienda's posts
// ---------------------------------------------------------------------------

async function graphPost(
  path: string,
  credentials: MetaCredentials,
  body: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; error?: string; code?: number }> {
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { error: "No se pudo contactar a Meta. Inténtalo de nuevo." };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: data?.error?.message ?? "Meta no aceptó la respuesta.", code: data?.error?.code };
  return { data: data ?? {} };
}

// A public reply under a comment. Instagram: POST /{comment-id}/replies
// (instagram_manage_comments). Facebook: POST /{comment-id}/comments
// (pages_manage_engagement). Comments are never hidden or deleted.
export async function replyToComment(
  platform: "instagram" | "facebook",
  commentId: string,
  text: string,
  credentials: MetaCredentials | null,
): Promise<{ externalId?: string; error?: string }> {
  if (!credentials) return { error: "Este canal no está conectado. Vuelve a conectarlo en Canales." };
  const edge = platform === "instagram" ? "replies" : "comments";
  const { data, error } = await graphPost(`${encodeURIComponent(commentId)}/${edge}`, credentials, { message: text });
  if (error) return { error };
  return { externalId: typeof data?.id === "string" ? data.id : undefined };
}

// The private reply to a comment: one DM to the person who commented, sent
// through the Page (Messenger Platform, recipient = the comment). Meta allows
// one per comment, within 7 days, and nothing else until the customer
// answers. Returns the customer's Instagram / Page-scoped id (recipient_id),
// which is how Chat recognizes them when they answer.
//
// With a product photo it goes as a card (photo, product and price, and the
// start of the text); if Meta refuses the card, the text goes alone.
export async function sendCommentPrivateReply(
  commentId: string,
  text: string,
  credentials: MetaCredentials | null,
  card?: { imageUrl: string; title: string } | null,
): Promise<{ externalMessageId?: string; recipientId?: string; error?: string; code?: number; asText?: boolean }> {
  if (!credentials) return { error: "Este canal no está conectado. Vuelve a conectarlo en Canales." };
  const path = `${encodeURIComponent(credentials.pageId)}/messages`;
  const send = (message: Record<string, unknown>) =>
    graphPost(path, credentials, { recipient: { comment_id: commentId }, message });

  let asText = !card;
  let result = card
    ? await send({
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [{ title: clip(card.title, 80), subtitle: clip(text, 80), image_url: card.imageUrl }],
          },
        },
      })
    : await send({ text });
  if (card && result.error) {
    asText = true;
    result = await send({ text });
  }
  if (result.error) return { error: result.error, code: result.code };
  return {
    externalMessageId: typeof result.data?.message_id === "string" ? result.data.message_id : undefined,
    recipientId: typeof result.data?.recipient_id === "string" ? result.data.recipient_id : undefined,
    asText,
  };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

// The post a comment is on: caption, link and picture, to show it in
// Comentarios and to know which product the customer asks about. Best effort.
export async function fetchPostInfo(
  platform: "instagram" | "facebook",
  postId: string,
  credentials: MetaCredentials | null,
): Promise<{ caption?: string; permalink?: string; imageUrl?: string }> {
  if (!credentials) return {};
  const fields =
    platform === "instagram" ? "caption,permalink,media_url,thumbnail_url,media_type" : "message,permalink_url,full_picture";
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(postId)}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return {};
    const data = await res.json().catch(() => null);
    if (!data) return {};
    if (platform === "instagram") {
      return {
        caption: data.caption || undefined,
        permalink: data.permalink || undefined,
        imageUrl: (data.media_type === "VIDEO" ? data.thumbnail_url : data.media_url) || undefined,
      };
    }
    return { caption: data.message || undefined, permalink: data.permalink_url || undefined, imageUrl: data.full_picture || undefined };
  } catch {
    return {};
  }
}
