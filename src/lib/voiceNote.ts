import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { MAX_VOICE_NOTE_BYTES } from "@/lib/outgoingMedia";

// Server-only. Turns a browser recording (WebM, Ogg or Safari's MP4) into a
// WhatsApp voice note: OGG/Opus, mono, small enough (≤ 512 KB) that
// WhatsApp shows the play button. Uses the ffmpeg bundled by ffmpeg-static
// (see next.config.ts).

const run = promisify(execFile);

// 24 kbps (constrained, so it stays near that rate: ~375 KB for 2 minutes)
// is clear for speech; 16 kbps is the fallback for a long note that
// would otherwise pass 512 KB.
const BITRATES = ["24k", "16k"];

export async function toVoiceNote(input: Buffer): Promise<Buffer | null> {
  if (!ffmpegPath) return null;
  const dir = await mkdtemp(join(tmpdir(), "cheke-voice-"));
  try {
    const source = join(dir, "in");
    await writeFile(source, input);
    let last: Buffer | null = null;
    for (const bitrate of BITRATES) {
      const target = join(dir, `out-${bitrate}.ogg`);
      await run(
        ffmpegPath,
        ["-v", "error", "-i", source, "-vn", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", bitrate, "-vbr", "constrained", "-application", "voip", "-f", "ogg", target],
        { timeout: 30_000 },
      );
      last = await readFile(target);
      if (last.length <= MAX_VOICE_NOTE_BYTES) return last;
    }
    return last; // still sends; WhatsApp shows a download icon instead of play
  } catch (error) {
    console.error("voice note encoding failed", error);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
