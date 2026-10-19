import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

// Server-only. Turns a video picked in Chat that isn't MP4 (iPhone .mov,
// some Android .webm) into an MP4 every network plays: H.264 video + AAC
// audio, at most 720p. An iPhone .mov that is already H.264 is only
// re-packed (fast, no quality lost). Uses the ffmpeg bundled by
// ffmpeg-static (see next.config.ts).

const run = promisify(execFile);

export async function toMp4(input: Buffer): Promise<Buffer | null> {
  if (!ffmpegPath) return null;
  const dir = await mkdtemp(join(tmpdir(), "cheke-video-"));
  try {
    const source = join(dir, "in");
    const target = join(dir, "out.mp4");
    await writeFile(source, input);
    const h264 = await isH264(ffmpegPath, source);
    const video = h264
      ? ["-c:v", "copy"]
      : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-vf", "scale='min(1280,iw)':-2", "-pix_fmt", "yuv420p"];
    await run(
      ffmpegPath,
      ["-v", "error", "-i", source, "-map", "0:v:0", "-map", "0:a:0?", ...video, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", target],
      { timeout: 45_000 },
    );
    return await readFile(target);
  } catch (error) {
    console.error("video conversion failed", error);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// `ffmpeg -i` with no output prints the streams and exits with an error.
async function isH264(ffmpeg: string, source: string): Promise<boolean> {
  try {
    await run(ffmpeg, ["-hide_banner", "-i", source], { timeout: 10_000 });
    return false;
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    return /Video: h264/.test(stderr);
  }
}
