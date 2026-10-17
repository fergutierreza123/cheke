import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import { GRAPH_API_VERSION } from "@/lib/meta";
import type { MediaInfo, MediaKind } from "@/lib/types";

// Server-only. Saves the photo, video, voice note or document of a message
// the webhooks already stored into the private "message-media" bucket
// (migration 0023), so Chat can show it. Runs after the webhook has answered
// Meta (`after()`), so a slow or failed download never delays or breaks it:
// the message just keeps its text ("📷 Foto", "🎤 Nota de voz").
//
// Locations and contact cards have no file: they only get their details.

export type MediaJob = {
  externalMessageId: string;
  kind: MediaKind;
  info: MediaInfo;
  // WhatsApp: the media id plus the channel's token. Instagram/Messenger:
  // the attachment's temporary link. None for locations and contacts.
  download?: { whatsappMediaId: string; accessToken: string } | { url: string };
};

const BUCKET = "message-media";
// Supabase's upload limit on the free plan; WhatsApp documents can be bigger.
const MAX_BYTES = 50 * 1024 * 1024;
const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export async function saveMessageMedia(supabase: SupabaseClient, jobs: MediaJob[]): Promise<void> {
  // A few at a time: a history import can bring many files at once.
  for (let i = 0; i < jobs.length; i += 3) {
    await Promise.all(
      jobs.slice(i, i + 3).map((job) =>
        saveOne(supabase, job).catch((error) => console.error("message media error", job.externalMessageId, error)),
      ),
    );
  }
}

async function saveOne(supabase: SupabaseClient, job: MediaJob) {
  const { data: message } = await supabase
    .from("messages")
    .select("id, business_id, store_id, media_path")
    .eq("external_message_id", job.externalMessageId)
    .maybeSingle();
  if (!message || message.media_path) return; // not saved, or already done

  const update: Record<string, unknown> = { media_kind: job.kind, media_info: job.info };

  const file = job.download ? await downloadFile(job.download) : null;
  if (file) {
    // <business>/<store>/<message>: the bucket's read policy checks the Tienda.
    const base = `${message.business_id}/${message.store_id}/${message.id}`;
    const path = `${base}.${extension(file.mime, job.info.filename)}`;
    await upload(supabase, path, file.bytes, file.mime);
    update.media_path = path;
    update.media_info = { ...job.info, mime: file.mime, size: file.bytes.length };

    // WhatsApp voice notes are OGG/Opus, which Safari and iPhones can't
    // play: keep an AAC/M4A copy that every browser can.
    if ((job.kind === "voice" || job.kind === "audio") && !PLAYS_EVERYWHERE.includes(file.mime)) {
      const m4a = await toM4a(file.bytes);
      if (m4a) {
        await upload(supabase, `${base}.m4a`, m4a, "audio/mp4");
        update.media_m4a_path = `${base}.m4a`;
      }
    }
  }

  const { error } = await supabase.from("messages").update(update).eq("id", message.id);
  if (error) throw new Error(error.message);
}

async function downloadFile(source: NonNullable<MediaJob["download"]>): Promise<{ bytes: Buffer; mime: string } | null> {
  try {
    let url: string;
    let headers: Record<string, string> = {};
    if ("whatsappMediaId" in source) {
      // WhatsApp: ask for a short-lived link (5 minutes), then fetch the
      // file from it with the same token.
      headers = { Authorization: `Bearer ${source.accessToken}` };
      const res = await fetch(`${GRAPH}/${encodeURIComponent(source.whatsappMediaId)}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      const meta = await res.json().catch(() => null);
      if (!res.ok || !meta?.url) {
        console.error("whatsapp media lookup failed", res.status, meta?.error?.message);
        return null;
      }
      if (Number(meta.file_size) > MAX_BYTES) return null;
      url = meta.url;
    } else {
      url = source.url;
    }
    if (!url.startsWith("https://")) return null;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok || Number(res.headers.get("content-length")) > MAX_BYTES) {
      console.error("media download failed", res.status);
      return null;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    const mime = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    return { bytes, mime };
  } catch (error) {
    console.error("media download error", error);
    return null;
  }
}

async function upload(supabase: SupabaseClient, path: string, bytes: Buffer, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

const PLAYS_EVERYWHERE = ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/mpeg", "audio/mp3"];

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "application/pdf": "pdf",
};

function extension(mime: string, filename?: string): string {
  if (EXTENSIONS[mime]) return EXTENSIONS[mime];
  const fromName = filename?.split(".").pop()?.toLowerCase();
  return fromName && /^[a-z0-9]{1,8}$/.test(fromName) ? fromName : "bin";
}

const run = promisify(execFile);

// ffmpeg (bundled by ffmpeg-static, see next.config.ts) in a temp folder:
// a 20-second voice note converts in well under a second.
export async function toM4a(input: Buffer): Promise<Buffer | null> {
  if (!ffmpegPath) return null;
  const dir = await mkdtemp(join(tmpdir(), "cheke-audio-"));
  try {
    const source = join(dir, "in");
    const target = join(dir, "out.m4a");
    await writeFile(source, input);
    await run(ffmpegPath, ["-v", "error", "-i", source, "-vn", "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", target], {
      timeout: 30_000,
    });
    return await readFile(target);
  } catch (error) {
    console.error("voice note conversion failed", error);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
