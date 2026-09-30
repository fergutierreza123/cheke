import { createHmac, timingSafeEqual } from "crypto";

const GRAPH_API_VERSION = "v21.0";

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

// Sends a free-text WhatsApp message via the test number configured in env
// vars. Only works inside the 24h customer-service window; outside it Meta
// rejects free-text sends and only approved templates are allowed (Phase 6+).
export async function sendWhatsAppMessage(toPhone: string, body: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return { error: "WhatsApp no está configurado todavía (faltan variables de entorno)." };
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toWhatsAppNumber(toPhone),
      type: "text",
      text: { body },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return { error: data?.error?.message ?? "No se pudo enviar el mensaje de WhatsApp." };
  }

  const externalMessageId: string | undefined = data?.messages?.[0]?.id;
  return { externalMessageId };
}
