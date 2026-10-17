import type { SupabaseClient } from "@supabase/supabase-js";
import {
  awaitsTranscription,
  canTranscribeMime,
  transcribe,
  transcriptionConfigured,
  transcriptionPrompt,
  type TranscriptionAudio,
} from "@/lib/transcription";

// Server-only. Saves the transcription of a customer's voice note on its
// message (migration 0025), right after src/lib/messageMedia.ts stored the
// file, still inside the webhook's `after()`: it never delays Meta's answer.
// Chat shows it under the audio; chekelin reads it as the customer's words.

let warnedMissingKey = false;

export async function transcribeVoiceNote(
  supabase: SupabaseClient,
  message: { id: string; store_id: string },
  // The original file and, when there is one, the M4A copy made for Chat.
  // Null when the download failed.
  audio: { original: TranscriptionAudio; m4a: TranscriptionAudio | null } | null,
): Promise<void> {
  if (!transcriptionConfigured()) {
    if (!warnedMissingKey) {
      console.warn("voice transcription skipped: OPENAI_API_KEY is not set (voice notes stay as '🎤 Nota de voz' for chekelin)");
      warnedMissingKey = true;
    }
    return;
  }

  const source = audio ? (canTranscribeMime(audio.original.mime) ? audio.original : audio.m4a) : null;
  if (!source) {
    await save(supabase, message.id, { transcription_status: "failed" });
    console.error("voice transcription failed", message.id, audio ? `no usable audio (${audio.original.mime})` : "no file");
    return;
  }

  const [{ data: store }, { data: products }] = await Promise.all([
    supabase.from("stores").select("name").eq("id", message.store_id).maybeSingle(),
    supabase.from("products").select("name").eq("store_id", message.store_id).eq("visible", true).order("created_at").limit(200),
  ]);
  const prompt = transcriptionPrompt({
    storeName: store?.name ?? null,
    productNames: (products ?? []).map((p) => String(p.name ?? "")),
  });

  const result = await transcribe(source, prompt);
  if ("text" in result) {
    await save(supabase, message.id, { transcription: result.text || null, transcription_status: "done" });
  } else if ("error" in result) {
    console.error("voice transcription failed", message.id, result.error);
    await save(supabase, message.id, { transcription_status: "failed" });
  }
}

async function save(supabase: SupabaseClient, id: string, update: Record<string, unknown>) {
  const { error } = await supabase.from("messages").update(update).eq("id", id);
  if (error) console.error("voice transcription save error", id, error.message);
}

// chekelin starts right when the customer's message arrives, while the
// voice note is still downloading and being transcribed. When the newest
// customer message is such a note, wait (up to `maxMs`) for its words, so
// chekelin answers what was said rather than "🎤 Nota de voz".
export async function waitForVoiceTranscription(
  supabase: SupabaseClient,
  conversationId: string,
  { maxMs = 20_000, everyMs = 1_000 }: { maxMs?: number; everyMs?: number } = {},
): Promise<void> {
  if (!transcriptionConfigured()) return;
  const deadline = Date.now() + maxMs;
  for (;;) {
    const { data } = await supabase
      .from("messages")
      .select("body, media_kind, transcription_status")
      .eq("conversation_id", conversationId)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || !awaitsTranscription(data)) return;
    if (Date.now() + everyMs > deadline) {
      console.warn("chekelin answered before the voice note was transcribed", conversationId);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
}
