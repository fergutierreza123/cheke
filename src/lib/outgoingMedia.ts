import type { ChannelType } from "@/lib/types";
import { visualBody, visualMime, visualUploadProblem, type VisualKind } from "@/lib/outgoingVisual";

// Voice notes, documents, photos and videos a person sends from Chat
// (issue #50; photos/videos in src/lib/outgoingVisual.ts). Kept free
// of server-only imports: the composer and the server check the same rules.
//
// How a send works:
//   1. The browser asks for a one-time upload link (prepareChatUpload).
//   2. It uploads the recording / file straight to the private
//      "message-media" bucket (Vercel can't take request bodies over 4.5 MB).
//   3. It asks /api/chat/media to send it: voice notes become OGG/Opus for
//      WhatsApp plus an M4A copy, then the message goes out on the channel.

export type OutgoingKind = "voice" | "document" | VisualKind;

export function isOutgoingKind(value: unknown): value is OutgoingKind {
  return value === "voice" || value === "document" || value === "image" || value === "video";
}

// Recordings stop on their own at 2 minutes: WhatsApp only shows the play
// button for voice notes up to 512 KB, which is ~2 minutes at 24 kbps.
export const MAX_VOICE_SECONDS = 120;
// The browser's own recording, before conversion (a 2-minute recording is
// 1–2 MB in every browser; this leaves room).
export const MAX_RECORDING_BYTES = 10 * 1024 * 1024;
// WhatsApp's voice-note limit for the play button.
export const MAX_VOICE_NOTE_BYTES = 512 * 1024;
// Instagram and Messenger take files up to 25 MB; WhatsApp more, but one
// limit for every channel is simpler to explain.
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

// Documents WhatsApp accepts. Instagram only takes PDFs.
const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
};
const EXTENSION_TYPES = Object.fromEntries(Object.entries(DOCUMENT_TYPES).map(([mime, ext]) => [ext, mime]));

// For the file picker's `accept`.
export function documentAccept(channelType: ChannelType | null | undefined): string {
  if (channelType === "instagram") return ".pdf,application/pdf";
  return Object.entries(DOCUMENT_TYPES)
    .flatMap(([mime, ext]) => [`.${ext}`, mime])
    .join(",");
}

// The document's type, from the browser's mime or else the file name (some
// phones report an empty type). Null when the channel can't send it.
export function documentMime(
  channelType: ChannelType | null | undefined,
  mime: string,
  filename: string,
): string | null {
  const clean = mime.split(";")[0].trim().toLowerCase();
  const fromName = EXTENSION_TYPES[filename.split(".").pop()?.toLowerCase() ?? ""];
  const resolved = DOCUMENT_TYPES[clean] ? clean : fromName ?? null;
  if (!resolved) return null;
  if (channelType === "instagram" && resolved !== "application/pdf") return null;
  return resolved;
}

export function documentExtension(mime: string): string {
  return DOCUMENT_TYPES[mime] ?? "bin";
}

// Browser recordings: Chrome/Android give WebM, Firefox Ogg, Safari and
// iPhone MP4 (AAC). All are converted on the server.
const RECORDING_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "video/webm": "webm", // some Chrome versions label audio-only WebM as video
  "video/mp4": "m4a",
};

export function recordingExtension(mime: string): string | null {
  return RECORDING_TYPES[mime.split(";")[0].trim().toLowerCase()] ?? null;
}

// The first format this browser can record, in order of preference. Empty
// string = let the browser choose (still one of the formats above).
export function pickRecordingMime(isTypeSupported: (type: string) => boolean): string {
  const preferred = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/aac", "audio/webm"];
  return preferred.find((type) => isTypeSupported(type)) ?? "";
}

// Checks an upload before it starts. Returns the Spanish reason, or null.
export function uploadProblem(input: {
  kind: OutgoingKind;
  channelType: ChannelType | null | undefined;
  mime: string;
  size: number;
  filename?: string;
}): string | null {
  if (!Number.isFinite(input.size) || input.size <= 0) return "El archivo está vacío.";
  if (input.kind === "image" || input.kind === "video") {
    const filename = input.filename ?? "";
    const visual = visualMime(input.mime, filename);
    if (visual && visual.kind !== input.kind) {
      return input.kind === "image" ? "Ese archivo no es una foto." : "Ese archivo no es un video.";
    }
    return visualUploadProblem({ channelType: input.channelType, mime: input.mime, filename, size: input.size });
  }
  if (input.kind === "voice") {
    if (!recordingExtension(input.mime)) return "Este formato de audio no se puede enviar.";
    if (input.size > MAX_RECORDING_BYTES) return "La nota de voz es muy larga.";
    return null;
  }
  if (!documentMime(input.channelType, input.mime, input.filename ?? "")) {
    return input.channelType === "instagram"
      ? "Instagram solo permite enviar documentos PDF."
      : "Ese tipo de archivo no se puede enviar. Usa PDF, Word, Excel, PowerPoint o texto.";
  }
  if (input.size > MAX_DOCUMENT_BYTES) return "El archivo pesa más de 25 MB.";
  return null;
}

// A file name that is safe to show and send: no folders, no control
// characters, at most 120 characters (keeping the extension).
export function cleanFilename(name: string, fallback = "Documento"): string {
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!base) return fallback;
  if (base.length <= 120) return base;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 9 ? base.slice(dot) : "";
  return base.slice(0, 120 - ext.length) + ext;
}

// The text kept in `body` (chat list preview, chekelin, fallback), the same
// words the webhooks use for received media.
export function outgoingBody(kind: OutgoingKind, filename?: string, caption?: string | null): string {
  if (kind === "image" || kind === "video") return visualBody(kind, caption);
  return kind === "voice" ? "🎤 Nota de voz" : `📄 ${filename ?? "Documento"}`;
}

// "0:07", "1:42" for the recording timer.
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
