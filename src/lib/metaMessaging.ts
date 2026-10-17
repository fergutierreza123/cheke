import { decryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";

// Server-only. Instagram DMs and Facebook Messenger, both through the
// business's Facebook Page (Messenger Platform, Facebook Login for Business).
// One Send API for both: POST /{page-id}/messages with the Page's token; the
// recipient is the customer's Instagram-scoped id (IGSID) or Page-scoped id
// (PSID), which the webhook stores on the contact.

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Fields each Page is subscribed to after connecting. `feed` is for
// Comentarios (comment-to-DM, built later); reactions and edits show on the
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
): Promise<{ externalMessageId?: string; error?: string }> {
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
  if (!res.ok) return { error: data?.error?.message ?? "Meta no aceptó el mensaje." };
  return { externalMessageId: data?.message_id };
}

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
): Promise<{ externalMessageId?: string; error?: string }> {
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
