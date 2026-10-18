import type { ChannelType } from "@/lib/types";

// Photos and videos a person sends from Chat, picked from the gallery or
// taken with the camera. Kept free of server-only imports: the composer and
// the server check the same rules (like src/lib/outgoingMedia.ts).
//
// Photos are shrunk in the browser before the upload (src/lib/chatPhoto.ts);
// videos that aren't MP4 (iPhone .mov, some Android .webm) become MP4 on the
// server, which every network plays.

export type VisualKind = "image" | "video";

// Every photo/video type a phone may hand us. HEIC (iPhone), WebP and GIF
// are only accepted as input: the browser redraws them as JPEG.
const VISUAL_TYPES: Record<string, VisualKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/heic": "image",
  "image/heif": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/3gpp": "video",
  "video/quicktime": "video",
  "video/webm": "video",
};
const VISUAL_EXTENSIONS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  "3gp": "video/3gpp",
  mov: "video/quicktime",
  webm: "video/webm",
};

// What a picked file is, from the browser's type or else its name (some
// phones give no type). Null when it isn't a photo or video we can send.
export function visualMime(mime: string, filename: string): { kind: VisualKind; mime: string } | null {
  const clean = mime.split(";")[0].trim().toLowerCase();
  const resolved = VISUAL_TYPES[clean] ? clean : VISUAL_EXTENSIONS[filename.split(".").pop()?.toLowerCase() ?? ""];
  if (!resolved) return null;
  return { kind: VISUAL_TYPES[resolved], mime: resolved };
}

const MB = 1024 * 1024;

// Meta's limits for a photo or video sent by the business (checked Oct 2026):
//   WhatsApp Cloud API: image JPEG/PNG 5 MB; video MP4/3GPP (H.264 + AAC) 16 MB.
//   Instagram Messaging: image PNG/JPEG 8 MB; video MP4/MOV/WebM… 25 MB.
//   Messenger: attachments up to 25 MB; photos kept at 8 MB like Instagram
//   (they are shrunk to ~1 MB in the browser anyway).
export function visualLimits(channelType: ChannelType | null | undefined): { image: number; video: number } {
  if (channelType === "instagram" || channelType === "facebook") return { image: 8 * MB, video: 25 * MB };
  return { image: 5 * MB, video: 16 * MB };
}

// The photo types that go up (the browser redraws HEIC/WebP/GIF as JPEG).
const UPLOAD_IMAGE_TYPES = ["image/jpeg", "image/png"];
// Videos sent as they are; the others are converted to MP4 on the server.
const MP4_TYPES = ["video/mp4", "video/3gpp"];
// An iPhone .mov is converted first, and usually ends smaller; past this it
// would take too long to convert (the send has one minute).
export const MAX_VIDEO_TO_CONVERT_BYTES = 50 * MB;

export function videoNeedsMp4(mime: string): boolean {
  return !MP4_TYPES.includes(mime);
}

function sizeText(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}

// Checks the photo or video about to be uploaded. Returns the Spanish
// reason, or null.
export function visualUploadProblem(input: {
  channelType: ChannelType | null | undefined;
  mime: string;
  filename: string;
  size: number;
}): string | null {
  if (!Number.isFinite(input.size) || input.size <= 0) return "El archivo está vacío.";
  const visual = visualMime(input.mime, input.filename);
  if (!visual) return "Solo puedes enviar una foto o un video desde aquí. Para otros archivos usa Documento.";
  const limits = visualLimits(input.channelType);
  if (visual.kind === "image") {
    if (!UPLOAD_IMAGE_TYPES.includes(visual.mime)) return "No se pudo preparar la foto. Prueba con otra foto en JPG o PNG.";
    if (input.size > limits.image) return `La foto pesa más de ${sizeText(limits.image)}.`;
    return null;
  }
  if (videoNeedsMp4(visual.mime)) {
    return input.size > MAX_VIDEO_TO_CONVERT_BYTES ? "El video es muy largo. Envía uno más corto." : null;
  }
  return input.size > limits.video ? videoTooBig(limits.video) : null;
}

function videoTooBig(limit: number): string {
  return `El video pesa más de ${sizeText(limit)}. Envía uno más corto.`;
}

// A photo the phone gave us that is too heavy to even open in the browser.
const MAX_PICKED_PHOTO_BYTES = 40 * MB;
export function pickedPhotoProblem(size: number): string | null {
  return size > MAX_PICKED_PHOTO_BYTES ? "La foto es muy pesada. Prueba con otra foto." : null;
}

// ---- Shrinking photos in the browser ----------------------------------------

// A phone photo (4032 × 3024, 3–8 MB) becomes ~1600 px and ~300–600 KB:
// sharp on any phone screen, quick on a slow connection, and well under
// every network's limit.
const MAX_PHOTO_SIDE = 1600;
const KEEP_AS_IS_BYTES = 1024 * 1024;
// Tried in order until the JPEG fits the network's limit.
export const JPEG_QUALITIES = [0.82, 0.7, 0.55];

export type PhotoPlan = { redraw: false } | { redraw: true; width: number; height: number };

export function photoPlan(input: { mime: string; size: number; width: number; height: number }): PhotoPlan {
  const longSide = Math.max(input.width, input.height);
  if (UPLOAD_IMAGE_TYPES.includes(input.mime) && input.size <= KEEP_AS_IS_BYTES && longSide <= MAX_PHOTO_SIDE) {
    return { redraw: false };
  }
  const scale = Math.min(1, MAX_PHOTO_SIDE / longSide);
  return {
    redraw: true,
    width: Math.max(1, Math.round(input.width * scale)),
    height: Math.max(1, Math.round(input.height * scale)),
  };
}

// ---- Captions and saved text ------------------------------------------------

// WhatsApp puts the text under the photo (caption, up to 1024 characters).
// Instagram and Messenger have no captions: the text goes as its own message
// right after the photo, with their text limits (1000 and 2000).
function captionLimit(channelType: ChannelType | null | undefined): number {
  if (channelType === "instagram") return 1000;
  if (channelType === "facebook") return 2000;
  return 1024;
}

export function captionProblem(channelType: ChannelType | null | undefined, caption: string): string | null {
  const limit = captionLimit(channelType);
  return caption.trim().length > limit ? `El texto de la foto puede tener hasta ${limit} letras.` : null;
}

// The text kept in `body` (chat list preview, chekelin, fallback): the same
// words the webhooks use for received photos and videos.
export function visualBody(kind: VisualKind, caption?: string | null): string {
  const text = caption?.trim();
  if (kind === "image") return text ? `📷 ${text}` : "📷 Foto";
  return text ? `🎥 ${text}` : "🎥 Video";
}

// The extension of the file in storage, from the type that goes up.
const UPLOAD_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
export function visualExtension(mime: string): string | null {
  return UPLOAD_EXTENSIONS[mime] ?? null;
}
export function visualMimeFromExtension(ext: string): string | null {
  return Object.entries(UPLOAD_EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? null;
}

// After the server made an MP4 out of a .mov/.webm.
export function convertedVideoProblem(channelType: ChannelType | null | undefined, size: number): string | null {
  const limit = visualLimits(channelType).video;
  return size > limit ? videoTooBig(limit) : null;
}
