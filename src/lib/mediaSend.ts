import { credentialsForChannel, toWhatsAppNumber, GRAPH_API_VERSION, type WhatsAppCredentials } from "@/lib/whatsapp";
import { metaCredentialsForChannel, postMessage } from "@/lib/metaMessaging";
import { replyWindow, windowClosedMessage } from "@/lib/messagingWindow";
import type { SendChannel, SendContact, SendResult } from "@/lib/channelSend";

// Server-only. Sends a voice note or a document a person recorded/attached
// in Chat (issue #50) on the conversation's own channel:
//   - WhatsApp: the file is uploaded to the number's /media first, then sent
//     by id. Voice notes go as `audio` with `voice: true` (OGG/Opus), so the
//     customer sees a real voice note with the play button; documents as
//     `document` with their file name.
//   - Instagram / Messenger: an attachment by link (a signed link to the
//     file in our bucket). Voice notes as `audio` (M4A; there is no voice-
//     note flag), documents as `file`.
// Same window rules as text (sendOnChannel): a person may still answer on
// Instagram/Facebook between 24 h and 7 days (HUMAN_AGENT tag).

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type OutgoingFile =
  | { kind: "voice"; ogg: Buffer; m4aUrl: string }
  | { kind: "document"; bytes: Buffer; mime: string; filename: string; url: string };

export async function sendMediaOnChannel(input: {
  channel: SendChannel | null | undefined;
  contact: SendContact | null | undefined;
  windowExpiresAt: string | null;
  file: OutgoingFile;
  // Meta's id of the message being answered ("Responder"), if any.
  replyToExternalId?: string | null;
}): Promise<SendResult> {
  const { channel, contact, file, replyToExternalId } = input;
  if (!channel || !contact) return { notSent: true };

  const state = replyWindow(channel.type, input.windowExpiresAt, Date.now());
  if (state === "closed") return { error: windowClosedMessage(channel.type) };

  if (channel.type === "whatsapp") {
    if (!contact.phone) return { notSent: true };
    return sendWhatsAppFile(contact.phone, credentialsForChannel(channel), file, replyToExternalId);
  }

  const recipientId = channel.type === "instagram" ? contact.ig_id : contact.fb_psid;
  if (!recipientId) return { notSent: true };
  const credentials = metaCredentialsForChannel(channel);
  if (!credentials) return { error: "Este canal no está conectado. Vuelve a conectarlo en Canales." };

  const routing =
    state === "human_agent" ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : { messaging_type: "RESPONSE" };
  const attachment =
    file.kind === "voice"
      ? { type: "audio", payload: { url: file.m4aUrl, is_reusable: false } }
      : { type: "file", payload: { url: file.url, is_reusable: false } };
  const recipient = { id: recipientId };
  if (replyToExternalId) {
    const quotedSend = await postMessage(credentials, {
      recipient,
      ...routing,
      message: { attachment, reply_to: { mid: replyToExternalId } },
    });
    // If Meta won't quote that message, still send the file on its own.
    if (!quotedSend.error) return { externalMessageId: quotedSend.externalMessageId };
  }
  const result = await postMessage(credentials, { recipient, ...routing, message: { attachment } });
  return result.error ? { error: result.error } : { externalMessageId: result.externalMessageId };
}

async function sendWhatsAppFile(
  toPhone: string,
  credentials: WhatsAppCredentials | null,
  file: OutgoingFile,
  replyToId?: string | null,
): Promise<SendResult> {
  if (!credentials) return { error: "El canal de WhatsApp de este negocio no está conectado todavía." };

  const upload =
    file.kind === "voice"
      ? await uploadWhatsAppMedia(credentials, file.ogg, "audio/ogg", "nota-de-voz.ogg")
      : await uploadWhatsAppMedia(credentials, file.bytes, file.mime, file.filename);
  if (!("id" in upload)) return upload;

  const content =
    file.kind === "voice"
      ? { type: "audio", audio: { id: upload.id, voice: true } }
      : { type: "document", document: { id: upload.id, filename: file.filename } };
  return postWhatsApp(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWhatsAppNumber(toPhone),
    ...(replyToId ? { context: { message_id: replyToId } } : {}),
    ...content,
  });
}

// POST /<phone_number_id>/media (multipart). The id lasts 30 days.
async function uploadWhatsAppMedia(
  credentials: WhatsAppCredentials,
  bytes: Buffer,
  mime: string,
  filename: string,
): Promise<{ id: string } | SendResult> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${credentials.phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { error: "No se pudo subir el archivo a WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) return metaError(data, "WhatsApp no aceptó el archivo.");
  return { id: String(data.id) };
}

async function postWhatsApp(credentials: WhatsAppCredentials, payload: Record<string, unknown>): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${credentials.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { error: "No se pudo contactar a WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) return metaError(data, "No se pudo enviar el mensaje de WhatsApp.");
  return { externalMessageId: data?.messages?.[0]?.id };
}

// Same shape as sendWhatsAppMessage's errors, so markMessageFailed can
// explain the reason in Spanish.
function metaError(data: { error?: { message?: string; code?: unknown; error_data?: { details?: string } } } | null, fallback: string): SendResult {
  const errorCode = typeof data?.error?.code === "number" ? data.error.code : undefined;
  const details = data?.error?.error_data?.details;
  return {
    error: data?.error?.message ?? fallback,
    errorCode,
    errorDetails: [data?.error?.message, details].filter(Boolean).join(" — ") || undefined,
  };
}
