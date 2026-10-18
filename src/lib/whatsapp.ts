import { createHmac, timingSafeEqual } from "crypto";
import { decryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";
import { isMetaAuthError } from "@/lib/metaTokens";

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

// `accessToken` is the token to try first; `fallbackAccessToken`, when set,
// is tried once if Meta refuses the first one for auth/permission reasons.
export type WhatsAppCredentials = {
  phoneNumberId: string;
  accessToken: string;
  fallbackAccessToken?: string;
  // The first token is cheke's own permanent system-user token (see below).
  usesSystemToken?: boolean;
};

type ChannelRow = { external_id: string | null; access_token_encrypted: string | null } | null | undefined;

// cheke's own permanent token (issue #56): an admin system user of Arguz's
// business portfolio, generated with expiration "Never". Embedded Signup
// shares each client's WhatsApp Business Account with that portfolio, so this
// one token can send, read media and manage every connected number, and the
// client never has to reconnect when Embedded Signup's 60-day token ends.
// Server-only. Unset = every channel uses its own token, as before.
export function systemUserToken(): string | null {
  return process.env.META_SYSTEM_USER_TOKEN?.trim() || null;
}

// Which WhatsApp number + token a conversation's channel sends through.
// A connected business has its own encrypted token (Embedded Signup). With
// META_SYSTEM_USER_TOKEN set, that token becomes the fallback and the system
// user's never-expiring token goes first. Only channels connected through
// Embedded Signup (they have a stored token) use it: a disconnected channel
// has none and gets nothing. The shared test number from env vars is only
// used for the one channel whose number *is* that test number — never as a
// fallback for another business, or one tenant's messages would go out from
// Cheke's own number.
export function credentialsForChannel(channel: ChannelRow): WhatsAppCredentials | null {
  if (!channel?.external_id) return null;

  if (channel.access_token_encrypted) {
    let own: string | undefined;
    try {
      own = decryptSecret(channel.access_token_encrypted);
    } catch (error) {
      console.error("whatsapp: could not decrypt channel token", error);
    }
    const system = systemUserToken();
    if (system) {
      return { phoneNumberId: channel.external_id, accessToken: system, fallbackAccessToken: own, usesSystemToken: true };
    }
    return own ? { phoneNumberId: channel.external_id, accessToken: own } : null;
  }

  const testId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const testToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (testId && testToken && channel.external_id === testId) {
    return { phoneNumberId: testId, accessToken: testToken };
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphBody = any;

// Calls the Graph API with the first token, and once more with the fallback
// token if Meta refused the first for auth/permission reasons (e.g. the
// system user can't see this WhatsApp account yet, or its token was revoked).
// Returns the last response's status and JSON body. Network errors throw.
export async function graphWithFallback(
  credentials: Pick<WhatsAppCredentials, "accessToken" | "fallbackAccessToken" | "usesSystemToken">,
  call: (token: string) => Promise<Response>,
): Promise<{ ok: boolean; data: GraphBody }> {
  const first = await call(credentials.accessToken);
  const firstData: GraphBody = await first.json().catch(() => null);
  if (first.ok || !isMetaAuthError(firstData?.error) || !credentials.fallbackAccessToken) {
    return { ok: first.ok, data: firstData };
  }
  if (credentials.usesSystemToken) {
    // Every client goes through this token: the founder has to look at it.
    console.error(
      `whatsapp: META_SYSTEM_USER_TOKEN refused (code ${firstData?.error?.code}); trying the channel's own token.`,
    );
  }
  const second = await call(credentials.fallbackAccessToken);
  return { ok: second.ok, data: await second.json().catch(() => null) };
}

// Marks the customer's message as read and shows "escribiendo…" in their
// WhatsApp until our next message (or up to 25 seconds). Best effort: a
// failure here never matters.
export async function sendWhatsAppTyping(credentials: WhatsAppCredentials | null, messageId: string): Promise<void> {
  if (!credentials || !messageId) return;
  try {
    await graphWithFallback(credentials, (token) =>
      fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
          typing_indicator: { type: "text" },
        }),
        signal: AbortSignal.timeout(5_000),
      }),
    );
  } catch {
    // ignore
  }
}

// Marks the customer's message (and every earlier one) as read: they see
// the blue ticks. No "escribiendo…". Best effort.
export async function markWhatsAppRead(credentials: WhatsAppCredentials | null, messageId: string): Promise<void> {
  if (!credentials || !messageId) return;
  try {
    await graphWithFallback(credentials, (token) =>
      fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
        signal: AbortSignal.timeout(5_000),
      }),
    );
  } catch {
    // ignore
  }
}

// Sends a WhatsApp message (text, or an image with the text as its caption
// when `mediaUrl` is given) through the given business's number.
// `replyToId` quotes one message of the chat ("Responder"); `reaction` sends
// an emoji on a message instead ("" takes it back); `location` sends a map
// pin (the Tienda's location) instead of text.
export type WhatsAppLocation = { latitude: number; longitude: number; name?: string; address?: string };

export async function sendWhatsAppMessage(
  toPhone: string,
  body: string,
  credentials: WhatsAppCredentials | null,
  mediaUrl?: string | null,
  {
    replyToId,
    reaction,
    location,
  }: { replyToId?: string | null; reaction?: { messageId: string; emoji: string }; location?: WhatsAppLocation | null } = {},
): Promise<{
  externalMessageId?: string;
  error?: string;
  errorCode?: number;
  errorDetails?: string;
  // Meta refused every token for auth/permission reasons: "Reconectar".
  needsReconnect?: boolean;
}> {
  if (!credentials) {
    return { error: "El canal de WhatsApp de este negocio no está conectado todavía." };
  }

  const to = toWhatsAppNumber(toPhone);
  const payload = reaction
    ? { messaging_product: "whatsapp", to, type: "reaction", reaction: { message_id: reaction.messageId, emoji: reaction.emoji } }
    : location
      ? {
          messaging_product: "whatsapp",
          to,
          type: "location",
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
            ...(location.name ? { name: location.name } : {}),
            ...(location.address ? { address: location.address } : {}),
          },
        }
      : {
        messaging_product: "whatsapp",
        to,
        ...(replyToId ? { context: { message_id: replyToId } } : {}),
        ...(mediaUrl ? { type: "image", image: { link: mediaUrl, caption: body } } : { type: "text", text: { body } }),
      };

  // A dropped connection or a Meta outage must come back as a normal error
  // the Chat screen can show, not an exception that breaks the server action.
  let res: { ok: boolean; data: GraphBody };
  try {
    res = await graphWithFallback(credentials, (token) =>
      fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      }),
    );
  } catch {
    return { error: "No se pudo contactar a WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }

  const data = res.data;
  if (!res.ok) {
    // Meta's error code (e.g. 131042 = payment problem) lets callers save a
    // plain-Spanish reason on the failed message (see whatsappErrors.ts).
    const errorCode: number | undefined = typeof data?.error?.code === "number" ? data.error.code : undefined;
    const details: string | undefined = data?.error?.error_data?.details;
    // Token expired/revoked, or the client removed cheke from its account.
    const needsReconnect = isMetaAuthError(data?.error);
    return {
      error: needsReconnect
        ? RECONNECT_MESSAGE
        : (data?.error?.message ?? "No se pudo enviar el mensaje de WhatsApp."),
      errorCode,
      errorDetails: [data?.error?.message, details].filter(Boolean).join(" — ") || undefined,
      needsReconnect: needsReconnect || undefined,
    };
  }

  const externalMessageId: string | undefined = data?.messages?.[0]?.id;
  return { externalMessageId };
}

export const RECONNECT_MESSAGE =
  "Meta cerró la conexión de este canal. Un dueño o gerente debe tocar «Reconectar» en Canales.";
