import { createHmac, timingSafeEqual } from "crypto";
import { decryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";

export { GRAPH_API_VERSION };

// Confirms a webhook request actually came from Meta: it signs the raw
// request body with your app secret and sends the digest in this header.
// Must run against the *raw* body text, before any JSON.parse.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !process.env.WHATSAPP_APP_SECRET) return false;

  const expected = createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

// Strips everything but digits, since the Graph API wants the recipient
// number as plain digits with country code (no "+", spaces or dashes).
// Contacts are often typed the way people say them out loud — "9922-3843" —
// so an 8-digit local Honduran number gets the 504 country code; anything
// longer is assumed to already carry its own.
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 8 ? `504${digits}` : digits;
}

// Same customer? Compares two phone numbers however they were typed
// ("+504 9922-3843", "99223843", "50499223843" are all the same person).
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = toWhatsAppNumber(a);
  const y = toWhatsAppNumber(b);
  return x.length > 0 && x === y;
}

export type WhatsAppCredentials = { phoneNumberId: string; accessToken: string };

type ChannelRow = { external_id: string | null; access_token_encrypted: string | null } | null | undefined;

// Which WhatsApp number + token a conversation's channel sends through.
// A connected business has its own encrypted token (Embedded Signup). The
// shared test number from env vars is only used for the one channel whose
// number *is* that test number — never as a fallback for another business,
// or one tenant's messages would go out from Cheke's own number.
export function credentialsForChannel(channel: ChannelRow): WhatsAppCredentials | null {
  if (!channel?.external_id) return null;

  if (channel.access_token_encrypted) {
    try {
      return { phoneNumberId: channel.external_id, accessToken: decryptSecret(channel.access_token_encrypted) };
    } catch (error) {
      console.error("whatsapp: could not decrypt channel token", error);
      return null;
    }
  }

  const testId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const testToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (testId && testToken && channel.external_id === testId) {
    return { phoneNumberId: testId, accessToken: testToken };
  }
  return null;
}

// Marks the customer's message as read and shows "escribiendo…" in their
// WhatsApp until our next message (or up to 25 seconds). Best effort: a
// failure here never matters.
export async function sendWhatsAppTyping(credentials: WhatsAppCredentials | null, messageId: string): Promise<void> {
  if (!credentials || !messageId) return;
  try {
    await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // ignore
  }
}

// Marks the customer's message (and every earlier one) as read: they see
// the blue ticks. No "escribiendo…". Best effort.
export async function markWhatsAppRead(credentials: WhatsAppCredentials | null, messageId: string): Promise<void> {
  if (!credentials || !messageId) return;
  try {
    await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // ignore
  }
}

// Sends a WhatsApp message (text, or an image with the text as its caption
// when `mediaUrl` is given) through the given business's number.
// `replyToId` quotes one message of the chat ("Responder"); `reaction` sends
// an emoji on a message instead ("" takes it back).
export async function sendWhatsAppMessage(
  toPhone: string,
  body: string,
  credentials: WhatsAppCredentials | null,
  mediaUrl?: string | null,
  { replyToId, reaction }: { replyToId?: string | null; reaction?: { messageId: string; emoji: string } } = {},
) {
  if (!credentials) {
    return { error: "El canal de WhatsApp de este negocio no está conectado todavía." };
  }

  const to = toWhatsAppNumber(toPhone);
  const payload = reaction
    ? { messaging_product: "whatsapp", to, type: "reaction", reaction: { message_id: reaction.messageId, emoji: reaction.emoji } }
    : {
        messaging_product: "whatsapp",
        to,
        ...(replyToId ? { context: { message_id: replyToId } } : {}),
        ...(mediaUrl ? { type: "image", image: { link: mediaUrl, caption: body } } : { type: "text", text: { body } }),
      };

  // A dropped connection or a Meta outage must come back as a normal error
  // the Chat screen can show, not an exception that breaks the server action.
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { error: "No se pudo contactar a WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Meta's error code (e.g. 131042 = payment problem) lets callers save a
    // plain-Spanish reason on the failed message (see whatsappErrors.ts).
    const errorCode: number | undefined = typeof data?.error?.code === "number" ? data.error.code : undefined;
    const details: string | undefined = data?.error?.error_data?.details;
    return {
      error: data?.error?.message ?? "No se pudo enviar el mensaje de WhatsApp.",
      errorCode,
      errorDetails: [data?.error?.message, details].filter(Boolean).join(" — ") || undefined,
    };
  }

  const externalMessageId: string | undefined = data?.messages?.[0]?.id;
  return { externalMessageId };
}
