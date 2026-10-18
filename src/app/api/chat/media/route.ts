import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEND_CHANNEL_COLUMNS, SEND_CONTACT_COLUMNS, type SendResult } from "@/lib/channelSend";
import { sendMediaOnChannel, type OutgoingFile } from "@/lib/mediaSend";
import { replyWindow, windowClosedMessage } from "@/lib/messagingWindow";
import { markMessageFailed } from "@/lib/whatsappErrors";
import { toM4a } from "@/lib/messageMedia";
import { toVoiceNote } from "@/lib/voiceNote";
import {
  MAX_DOCUMENT_BYTES,
  MAX_RECORDING_BYTES,
  MAX_VOICE_SECONDS,
  cleanFilename,
  documentExtension,
  documentMime,
  outgoingBody,
  type OutgoingKind,
} from "@/lib/outgoingMedia";
import type { ChannelType, MediaInfo, Message } from "@/lib/types";
import { friendlyError } from "@/lib/dbErrors";
import { ARCHIVED_STORE_READ_ONLY, isArchivedStore } from "@/lib/stores";

// Step 2 of sending a voice note or document from Chat (issue #50). The
// browser already uploaded the file (prepareChatUpload); this:
//   1. converts a voice note to OGG/Opus (WhatsApp) + M4A (Instagram,
//      Messenger and cheke's own player on iPhone), or files a document
//      under the message,
//   2. saves the outgoing message with its media, like received ones, so
//      Chat shows it with MessageMedia,
//   3. sends it on the conversation's channel (same 24 h / 7 day rules).
// A route (not a Server Action) so the ffmpeg program is bundled with it
// (next.config.ts) and it can run up to a minute.
export const maxDuration = 60;

const BUCKET = "message-media";
const LINK_SECONDS = 60 * 60;

type Body = {
  conversationId?: unknown;
  kind?: unknown;
  path?: unknown;
  filename?: unknown;
  duration?: unknown;
  replyToId?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  const kind: OutgoingKind | null = body?.kind === "voice" || body?.kind === "document" ? body.kind : null;
  const path = typeof body?.path === "string" ? body.path : null;
  if (!conversationId || !kind || !path) return reply({ error: "Faltan datos para enviar." }, 400);

  const supabase = await createClient();
  // Signed-in client: RLS only finds conversations of the person's Tiendas.
  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      `id, business_id, store_id, window_expires_at, contact:contacts(${SEND_CONTACT_COLUMNS}), channel:channels(${SEND_CHANNEL_COLUMNS}), store:stores(archived_at)`,
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return reply({ error: "No se encontró la conversación." }, 404);
  if (isArchivedStore(conversation.store)) return reply({ error: ARCHIVED_STORE_READ_ONLY }, 409);

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const channel = Array.isArray(conversation.channel) ? conversation.channel[0] : conversation.channel;
  const channelType = (channel?.type ?? null) as ChannelType | null;

  // Only a file prepareChatUpload made for this same Tienda.
  const prefix = `${conversation.business_id}/${conversation.store_id}/uploads/`;
  if (!path.startsWith(prefix) || !/^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(path.slice(prefix.length))) {
    return reply({ error: "El archivo no es válido." }, 400);
  }

  const admin = createAdminClient();
  const storage = admin.storage.from(BUCKET);
  const discard = () => storage.remove([path]).then(() => undefined, () => undefined);

  if (replyWindow(channelType, conversation.window_expires_at, Date.now()) === "closed") {
    await discard();
    return reply({ error: windowClosedMessage(channelType) });
  }

  const { data: blob } = await storage.download(path);
  const raw = blob ? Buffer.from(await blob.arrayBuffer()) : null;
  if (!raw || raw.length === 0) return reply({ error: "No llegó el archivo. Inténtalo de nuevo." });
  if (raw.length > (kind === "voice" ? MAX_RECORDING_BYTES : MAX_DOCUMENT_BYTES)) {
    await discard();
    return reply({ error: kind === "voice" ? "La nota de voz es muy larga." : "El archivo pesa más de 25 MB." });
  }

  // Files sit next to the message, like received media: <business>/<store>/<message>.<ext>
  const messageId = randomUUID();
  const base = `${conversation.business_id}/${conversation.store_id}/${messageId}`;
  let file: OutgoingFile;
  let media: { media_path: string; media_m4a_path: string | null; media_info: MediaInfo };

  if (kind === "voice") {
    const [ogg, m4a] = await Promise.all([toVoiceNote(raw), toM4a(raw)]);
    if (!ogg || !m4a) {
      await discard();
      return reply({ error: "No se pudo preparar la nota de voz. Inténtalo de nuevo." });
    }
    const uploads = await Promise.all([
      storage.upload(`${base}.ogg`, ogg, { contentType: "audio/ogg", upsert: true }),
      storage.upload(`${base}.m4a`, m4a, { contentType: "audio/mp4", upsert: true }),
    ]);
    await discard();
    if (uploads.some((u) => u.error)) return reply({ error: "No se pudo guardar la nota de voz. Inténtalo de nuevo." });
    const { data: link } = await storage.createSignedUrl(`${base}.m4a`, LINK_SECONDS);
    const seconds = Number(body?.duration);
    media = {
      media_path: `${base}.ogg`,
      media_m4a_path: `${base}.m4a`,
      media_info: {
        mime: "audio/ogg",
        size: ogg.length,
        ...(Number.isFinite(seconds) && seconds > 0 ? { duration: Math.min(Math.round(seconds), MAX_VOICE_SECONDS) } : {}),
      },
    };
    file = { kind: "voice", ogg, m4aUrl: link?.signedUrl ?? "" };
  } else {
    const filename = cleanFilename(typeof body?.filename === "string" ? body.filename : "");
    const mime = documentMime(channelType, "", `upload.${path.split(".").pop()}`);
    if (!mime) {
      await discard();
      return reply({ error: "Ese tipo de archivo no se puede enviar." });
    }
    const target = `${base}.${documentExtension(mime)}`;
    const { error: moveError } = await storage.move(path, target);
    if (moveError) return reply({ error: "No se pudo guardar el archivo. Inténtalo de nuevo." });
    const { data: link } = await storage.createSignedUrl(target, LINK_SECONDS, { download: filename });
    media = { media_path: target, media_m4a_path: null, media_info: { filename, mime, size: raw.length } };
    file = { kind: "document", bytes: raw, mime, filename, url: link?.signedUrl ?? "" };
  }

  // "Responder": the quoted message must be in this same conversation.
  let quoted: { id: string; external_message_id: string | null } | null = null;
  if (typeof body?.replyToId === "string" && body.replyToId) {
    const { data } = await supabase
      .from("messages")
      .select("id, external_message_id")
      .eq("id", body.replyToId)
      .eq("conversation_id", conversation.id)
      .maybeSingle();
    quoted = data;
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      id: messageId,
      conversation_id: conversation.id,
      business_id: conversation.business_id,
      direction: "out",
      body: outgoingBody(kind, media.media_info.filename),
      media_kind: kind,
      ...media,
      ...(quoted ? { reply_to_id: quoted.id } : {}),
    })
    .select("*")
    .single();
  if (insertError || !message) {
    await storage.remove([media.media_path, ...(media.media_m4a_path ? [media.media_m4a_path] : [])]).catch(() => undefined);
    return reply({ error: friendlyError(insertError, "No se pudo guardar el mensaje.") });
  }

  await supabase.from("conversations").update({ last_message_at: message.created_at }).eq("id", conversation.id);

  // The app reviewers' demo Negocio (and conversations without a channel)
  // only save in cheke, never send — same as text replies.
  const { data: business } = await supabase.from("businesses").select("is_demo").eq("id", conversation.business_id).maybeSingle();
  const result: SendResult = business?.is_demo
    ? { notSent: true }
    : await sendMediaOnChannel({
        channel,
        contact,
        windowExpiresAt: conversation.window_expires_at,
        file,
        replyToExternalId: quoted?.external_message_id ?? null,
      });

  if (result.error) {
    const failed = await markMessageFailed(supabase, message.id, result);
    return reply({ message: { ...message, ...failed } as Message, sendError: result.error });
  }
  if (!result.notSent && result.externalMessageId) {
    await supabase.from("messages").update({ external_message_id: result.externalMessageId }).eq("id", message.id);
  }
  return reply({ message: message as Message });
}

function reply(body: { message?: Message; error?: string; sendError?: string }, status = 200) {
  return NextResponse.json(body, { status });
}
