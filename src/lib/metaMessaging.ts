import { decryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";

// Server-only. Instagram DMs and Facebook Messenger, both through the
// business's Facebook Page (Messenger Platform, Facebook Login for Business).
// One Send API for both: POST /{page-id}/messages with the Page's token; the
// recipient is the customer's Instagram-scoped id (IGSID) or Page-scoped id
// (PSID), which the webhook stores on the contact.

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Fields each Page is subscribed to after connecting. `feed` is for
// Comentarios (comment-to-DM, built later); Instagram's own fields are set
// once for the whole app in the Meta App Dashboard.
export const PAGE_SUBSCRIBED_FIELDS = ["messages", "messaging_postbacks", "message_echoes", "message_deliveries", "message_reads", "feed"];

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

async function postMessage(
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
// it must never be set for chekelin or any automation.
export async function sendMetaMessage(
  recipientId: string,
  text: string,
  credentials: MetaCredentials | null,
  { mediaUrl, humanAgent = false }: { mediaUrl?: string | null; humanAgent?: boolean } = {},
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
  return postMessage(credentials, { recipient, ...routing, message: { text } });
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
