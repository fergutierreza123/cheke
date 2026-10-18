import { credentialsForChannel, graphWithFallback, toWhatsAppNumber, GRAPH_API_VERSION, type WhatsAppCredentials } from "@/lib/whatsapp";
import { metaCredentialsForChannel, postMessage } from "@/lib/metaMessaging";
import { replyWindow, windowClosedMessage } from "@/lib/messagingWindow";
import type { SendChannel, SendContact, SendResult } from "@/lib/channelSend";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphBody = any;

// Server-only. Sends a voice note or a document a person recorded/attached
// in Chat (issue #50) on the conversation's own channel:
//   - WhatsApp: the file is uploaded to the number's /media first, then sent
//     by id. Voice notes go as `audio` with `voice: true` (OGG/Opus), so the
//     customer sees a real voice note with the play button; documents as
//     `document` with their file name.
//   - Instagram / Messenger: an attachment by link (a signed link to the
//     file in our bucket). Voice notes as `audio` (M4A; there is no voice-
//     note flag), documents as `file`.
// Photos and videos (picked or taken with the camera) work the same way:
//   - WhatsApp: uploaded to /media, sent as `image` / `video` by id with the
//     typed text as the caption under it.
//   - Instagram / Messenger: an `image` / `video` attachment by link; they
//     have no captions, so the text follows as its own message.
// Same window rules as text (sendOnChannel): a person may still answer on
// Instagram/Facebook between 24 h and 7 days (HUMAN_AGENT tag).

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type OutgoingFile =
  | { kind: "voice"; ogg: Buffer; m4aUrl: string }
  | { kind: "document"; bytes: Buffer; mime: string; filename: string; url: string }
  | { kind: "image" | "video"; bytes: Buffer; mime: string; url: string; caption?: string | null };

// The WhatsApp message content for a file already uploaded to /media.
export function whatsappMediaContent(file: OutgoingFile, mediaId: string): Record<string, unknown> {
  switch (file.kind) {
    case "voice":
      return { type: "audio", audio: { id: mediaId, voice: true } };
    case "document":
      return { type: "document", document: { id: mediaId, filename: file.filename } };
    default: {
      const caption = file.caption?.trim();
      return { type: file.kind, [file.kind]: { id: mediaId, ...(caption ? { caption } : {}) } };
    }
  }
}

// The Instagram/Messenger attachment (Meta downloads it from our signed link).
export function metaAttachment(file: OutgoingFile): { type: string; payload: { url: string; is_reusable: false } } {
  if (file.kind === "voice") return { type: "audio", payload: { url: file.m4aUrl, is_reusable: false } };
  if (file.kind === "document") return { type: "file", payload: { url: file.url, is_reusable: false } };
  return { type: file.kind, payload: { url: file.url, is_reusable: false } };
}

// Instagram/Messenger have no captions: the text sent right after the photo.
export function metaFollowUpText(file: OutgoingFile): string | null {
  if (file.kind !== "image" && file.kind !== "video") return null;
  return file.caption?.trim() || null;
}

function uploadName(file: OutgoingFile): string {
  if (file.kind === "voice") return "nota-de-voz.ogg";
  if (file.kind === "document") return file.filename;
  return file.kind === "image" ? `foto.${file.mime === "image/png" ? "png" : "jpg"}` : `video.${file.mime === "video/3gpp" ? "3gp" : "mp4"}`;
}

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
  const attachment = metaAttachment(file);
  const recipient = { id: recipientId };
  let sent: { externalMessageId?: string } | null = null;
  if (replyToExternalId) {
    const quotedSend = await postMessage(credentials, {
      recipient,
      ...routing,
      message: { attachment, reply_to: { mid: replyToExternalId } },
    });
    // If Meta won't quote that message, still send the file on its own.
    if (!quotedSend.error) sent = { externalMessageId: quotedSend.externalMessageId };
  }
  if (!sent) {
    const result = await postMessage(credentials, { recipient, ...routing, message: { attachment } });
    if (result.error) return { error: result.error };
    sent = { externalMessageId: result.externalMessageId };
  }
  // No captions on Instagram/Messenger: the typed text follows the photo.
  const text = metaFollowUpText(file);
  if (text) {
    const caption = await postMessage(credentials, { recipient, ...routing, message: { text } });
    // The photo itself arrived, so the message isn't marked as failed.
    if (caption.error) console.error("caption after attachment failed", caption.error);
  }
  return sent;
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
      ? await uploadWhatsAppMedia(credentials, file.ogg, "audio/ogg", uploadName(file))
      : await uploadWhatsAppMedia(credentials, file.bytes, file.mime, uploadName(file));
  if (!("id" in upload)) return upload;

  const content = whatsappMediaContent(file, upload.id);
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
  let res: { ok: boolean; data: GraphBody };
  try {
    res = await graphWithFallback(credentials, (token) =>
      fetch(`${GRAPH}/${credentials.phoneNumberId}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      }),
    );
  } catch {
    return { error: "No se pudo subir el archivo a WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
  const data = res.data;
  if (!res.ok || !data?.id) return metaError(data, "WhatsApp no aceptó el archivo.");
  return { id: String(data.id) };
}

async function postWhatsApp(credentials: WhatsAppCredentials, payload: Record<string, unknown>): Promise<SendResult> {
  let res: { ok: boolean; data: GraphBody };
  try {
    res = await graphWithFallback(credentials, (token) =>
      fetch(`${GRAPH}/${credentials.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      }),
    );
  } catch {
    return { error: "No se pudo contactar a WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
  const data = res.data;
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
