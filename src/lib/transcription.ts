// Speech-to-text for the voice notes customers send (issue #49). Claude
// can't hear audio, so chekelin reads a transcription instead, and Chat shows
// it under the audio ("Transcripción"): people read faster than they listen.
//
// One provider today: OpenAI `gpt-4o-transcribe` (Spanish, with a vocabulary
// prompt of the Tienda's product names). Everything provider-specific stays
// in `transcribe()`, so it can change after the bake-off
// (`npm run bakeoff:transcribe`, scripts/bakeoff-transcribe.mjs).
//
// No `@/` imports here: the bake-off script loads this file straight from Node.

export const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

export type TranscriptionAudio = { bytes: Uint8Array; mime: string };

export type TranscriptionResult =
  | { text: string }
  // Not configured (no OPENAI_API_KEY): nothing was sent anywhere.
  | { skipped: string }
  | { error: string };

// What OpenAI's transcription endpoint accepts (WhatsApp's OGG/Opus included).
// Anything else (AMR…) goes through the M4A copy made for Chat.
const OPENAI_AUDIO: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "video/mp4": "mp4",
};

// OpenAI's upload limit.
const MAX_BYTES = 25 * 1024 * 1024;

export function canTranscribeMime(mime: string): boolean {
  return mime in OPENAI_AUDIO;
}

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

// Words a generic model gets wrong in a Honduran shop's voice notes. Product
// names come first (they matter most); this list fills the rest.
const HONDURAN_WORDS = ["pisto", "maje", "cipote", "va pues", "lempiras", "colonia", "aldea", "encomienda", "Tegucigalpa", "San Pedro Sula"];

// The prompt is a hint, not an instruction: it biases spelling toward these
// words. Kept short so it never crowds out the audio.
const PROMPT_MAX_CHARS = 900;

export function transcriptionPrompt({ storeName, productNames }: { storeName?: string | null; productNames: string[] }): string {
  const intro = `Nota de voz de un cliente de Honduras${storeName?.trim() ? ` a la tienda ${storeName.trim()}` : ""}.`;
  const tail = ` Palabras comunes: ${HONDURAN_WORDS.join(", ")}.`;

  const seen = new Set<string>();
  const names: string[] = [];
  let budget = PROMPT_MAX_CHARS - intro.length - tail.length - " Productos: .".length;
  for (const raw of productNames) {
    const name = raw.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    const cost = name.length + (names.length > 0 ? 2 : 0);
    if (cost > budget) break;
    seen.add(key);
    names.push(name);
    budget -= cost;
  }
  return intro + (names.length > 0 ? ` Productos: ${names.join(", ")}.` : "") + tail;
}

export async function transcribe(
  audio: TranscriptionAudio,
  prompt: string,
  { model = TRANSCRIPTION_MODEL, apiKey = process.env.OPENAI_API_KEY }: { model?: string; apiKey?: string } = {},
): Promise<TranscriptionResult> {
  if (!apiKey?.trim()) return { skipped: "OPENAI_API_KEY is not set" };
  const extension = OPENAI_AUDIO[audio.mime];
  if (!extension) return { error: `unsupported audio type ${audio.mime}` };
  if (audio.bytes.length === 0 || audio.bytes.length > MAX_BYTES) return { error: `audio size ${audio.bytes.length} bytes` };

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio.bytes)], { type: audio.mime }), `nota.${extension}`);
  form.append("model", model);
  form.append("language", "es");
  form.append("prompt", prompt);
  form.append("response_format", "json");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: `openai ${res.status}: ${data?.error?.message ?? "no details"}` };
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    return { text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// How chekelin reads a customer's message: a transcribed voice note becomes
// its words; everything else (and a note not transcribed) keeps its text.
export function textForChekelin(m: { body: string | null; transcription?: string | null }): string | null {
  const said = m.transcription?.trim();
  return said ? `[Nota de voz]: "${said}"` : m.body;
}

// A voice note or audio whose transcription chekelin should wait for. Before
// its file is saved the message only has its text, the same for both
// channels' webhooks (src/lib/whatsappMessages.ts, src/app/api/meta/webhook).
export const VOICE_NOTE_BODY = "🎤 Nota de voz";
// An audio file (forwarded, or a song) rather than a recorded voice note.
export const AUDIO_BODY = "🎵 Audio";

export function awaitsTranscription(m: {
  body: string | null;
  media_kind?: string | null;
  transcription_status?: string | null;
}): boolean {
  const isAudio = m.media_kind === "voice" || m.media_kind === "audio" || (!m.media_kind && (m.body === VOICE_NOTE_BODY || m.body === AUDIO_BODY));
  return isAudio && !m.transcription_status;
}
