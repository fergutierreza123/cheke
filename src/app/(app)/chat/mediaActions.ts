"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { replyWindow, windowClosedMessage } from "@/lib/messagingWindow";
import { documentExtension, documentMime, recordingExtension, uploadProblem, type OutgoingKind } from "@/lib/outgoingMedia";
import { visualExtension, visualMime } from "@/lib/outgoingVisual";
import type { ChannelType } from "@/lib/types";
import { ARCHIVED_STORE_READ_ONLY, isArchivedStore } from "@/lib/stores";
import { canSimulate, SIMULATE_ONLY_IN_SAMPLES } from "@/lib/modoPrueba";

// Step 1 of sending a voice note or document from Chat (issue #50): a
// one-time link to upload the file straight to the private "message-media"
// bucket. Step 2 is POST /api/chat/media.
export async function prepareChatUpload(
  conversationId: string,
  input: { kind: OutgoingKind; mime: string; size: number; filename?: string },
  // Modo prueba: the file is the (sample) customer's, so the reply window
  // doesn't apply; only sample chats and the demo Negocio allow it.
  options: { asCustomer?: boolean } = {},
): Promise<{ path?: string; token?: string; error?: string }> {
  const supabase = await createClient();
  // The signed-in client: RLS only finds conversations of the person's Tiendas.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, business_id, store_id, window_expires_at, channel:channels(type, access_token_encrypted), store:stores(archived_at)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return { error: "No se encontró la conversación." };
  if (isArchivedStore(conversation.store)) return { error: ARCHIVED_STORE_READ_ONLY };

  const channel = Array.isArray(conversation.channel) ? conversation.channel[0] : conversation.channel;
  const channelType = (channel?.type ?? null) as ChannelType | null;
  if (options.asCustomer) {
    const { data: business } = await supabase.from("businesses").select("is_demo").eq("id", conversation.business_id).maybeSingle();
    if (!canSimulate(channel, business?.is_demo === true)) return { error: SIMULATE_ONLY_IN_SAMPLES };
  } else if (replyWindow(channelType, conversation.window_expires_at, Date.now()) === "closed") {
    return { error: windowClosedMessage(channelType) };
  }

  const problem = uploadProblem({ ...input, channelType });
  if (problem) return { error: problem };

  const ext =
    input.kind === "voice"
      ? recordingExtension(input.mime)
      : input.kind === "image" || input.kind === "video"
        ? visualExtension(visualMime(input.mime, input.filename ?? "")?.mime ?? "")
        : documentExtension(documentMime(channelType, input.mime, input.filename ?? "")!);
  if (!ext) return { error: "Ese tipo de archivo no se puede enviar." };
  // <business>/<store>/uploads/<random>: the bucket's read policy checks the
  // Tienda folder; /api/chat/media only accepts paths of this shape.
  const path = `${conversation.business_id}/${conversation.store_id}/uploads/${randomUUID()}.${ext}`;

  // Only the server writes to the bucket: a signed upload link lets the
  // browser put exactly this one file there.
  const { data, error } = await createAdminClient().storage.from("message-media").createSignedUploadUrl(path);
  if (error || !data) return { error: "No se pudo preparar el envío. Inténtalo de nuevo." };
  return { path: data.path, token: data.token };
}
