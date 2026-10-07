import { createHmac, timingSafeEqual } from "crypto";
import { decryptSecret } from "@/lib/crypto";

export const GRAPH_API_VERSION = "v21.0";

// Confirms a webhook request actually came from Meta: it signs the raw
// request body with your app secret and sends the digest in this header.
// Must run against the *raw* body text, before any JSON.parse.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", process.env.WHATSAPP_APP_SECRET!)
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
export function toWhatsAppNumber(phone: string): string {
  return phone.replace(/\D/g, "");
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

// Sends a WhatsApp message (text, or an image with the text as its caption
// when `mediaUrl` is given) through the given business's number.
export async function sendWhatsAppMessage(
  toPhone: string,
  body: string,
  credentials: WhatsAppCredentials | null,
  mediaUrl?: string | null,
) {
  if (!credentials) {
    return { error: "El canal de WhatsApp de este negocio no está conectado todavía." };
  }

  const payload = mediaUrl
    ? { messaging_product: "whatsapp", to: toWhatsAppNumber(toPhone), type: "image", image: { link: mediaUrl, caption: body } }
    : { messaging_product: "whatsapp", to: toWhatsAppNumber(toPhone), type: "text", text: { body } };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    return { error: data?.error?.message ?? "No se pudo enviar el mensaje de WhatsApp." };
  }

  const externalMessageId: string | undefined = data?.messages?.[0]?.id;
  return { externalMessageId };
}
