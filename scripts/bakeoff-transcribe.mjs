// Voice-note bake-off (issue #49): runs a folder of real customer voice
// notes through OpenAI gpt-4o-transcribe (what cheke uses), OpenAI
// gpt-4o-mini-transcribe (half the price) and ElevenLabs Scribe, and writes
// one CSV for a Honduran reader to score: did each one get the product,
// quantity, size/color and address right?
//
// Usage (from the repo root, Node 22.18+ / 24):
//   npm run bakeoff:transcribe -- <notes-folder> [--store "Nombre de la tienda"]
//       [--products products.txt] [--provider all|openai|openai-mini|elevenlabs]
//       [--out bakeoff.csv] [--dry-run]
//
// products.txt: one product name per line (the Tienda's Catálogo). OpenAI
// gets them as its vocabulary prompt, exactly like in cheke.
// --dry-run lists the notes and prints the prompt without calling anything.
//
// Keys come from .env.local: OPENAI_API_KEY, ELEVENLABS_API_KEY. A provider
// without its key is skipped. ELEVENLABS_STT_MODEL overrides Scribe's model
// id (default scribe_v2). Cost: about US$0.006 per minute of audio per
// provider, i.e. cents for 50 notes.

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { TRANSCRIPTION_MODEL, transcribe, transcriptionPrompt } from "../src/lib/transcription.ts";

const AUDIO_TYPES = {
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".oga": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".flac": "audio/flac",
};

function parseArgs(argv) {
  const args = { input: null, store: null, products: null, provider: "all", out: "bakeoff-transcribe.csv", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--store") args.store = argv[++i];
    else if (a === "--products") args.products = argv[++i];
    else if (a === "--provider") args.provider = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (!args.input) args.input = a;
  }
  return args;
}

const PROVIDERS = {
  openai: {
    label: TRANSCRIPTION_MODEL,
    key: "OPENAI_API_KEY",
    run: (audio, prompt) => transcribe(audio, prompt, { model: TRANSCRIPTION_MODEL }),
  },
  "openai-mini": {
    label: "gpt-4o-mini-transcribe",
    key: "OPENAI_API_KEY",
    run: (audio, prompt) => transcribe(audio, prompt, { model: "gpt-4o-mini-transcribe" }),
  },
  elevenlabs: {
    label: `elevenlabs ${process.env.ELEVENLABS_STT_MODEL || "scribe_v2"}`,
    key: "ELEVENLABS_API_KEY",
    run: elevenLabs,
  },
};

// ElevenLabs Speech to Text. No vocabulary hints are sent (cheke's OpenAI
// prompt has no exact equivalent), so compare with that in mind.
async function elevenLabs(audio) {
  const form = new FormData();
  form.append("file", new Blob([audio.bytes], { type: audio.mime }), "nota");
  form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
  form.append("language_code", "es");
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: `elevenlabs ${res.status}: ${JSON.stringify(data?.detail ?? data)}` };
    return { text: String(data?.text ?? "").trim() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const csv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: npm run bakeoff:transcribe -- <notes-folder> [--store "Tienda"] [--products products.txt] [--provider all] [--dry-run]');
    process.exit(1);
  }
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const productNames = args.products ? (await readFile(args.products, "utf8")).split(/\r?\n/).filter((l) => l.trim()) : [];
  const prompt = transcriptionPrompt({ storeName: args.store, productNames });

  const files = (await readdir(args.input))
    .filter((f) => AUDIO_TYPES[path.extname(f).toLowerCase()])
    .sort();
  if (files.length === 0) {
    console.error(`No voice notes (${Object.keys(AUDIO_TYPES).join(" ")}) in ${args.input}`);
    process.exit(1);
  }

  const wanted = args.provider === "all" ? Object.keys(PROVIDERS) : args.provider.split(",");
  const unknown = wanted.filter((name) => !PROVIDERS[name]);
  if (unknown.length) {
    console.error(`Unknown provider: ${unknown.join(", ")}. Use: all, ${Object.keys(PROVIDERS).join(", ")}`);
    process.exit(1);
  }

  console.log(`${files.length} notes. Vocabulary prompt:\n  ${prompt}\n`);
  if (args.dryRun) {
    for (const f of files) console.log(`  ${f}`);
    console.log(`\nWould run: ${wanted.map((n) => PROVIDERS[n].label).join(", ")}. Nothing was sent (--dry-run).`);
    return;
  }

  const active = wanted.filter((name) => {
    if (process.env[PROVIDERS[name].key]?.trim()) return true;
    console.warn(`Skipping ${PROVIDERS[name].label}: ${PROVIDERS[name].key} is not set in .env.local`);
    return false;
  });
  if (active.length === 0) {
    console.error("No provider has its API key set. Add the keys to .env.local, or use --dry-run.");
    process.exit(1);
  }

  const rows = [["file", "provider", "seconds", "transcription", "producto_ok", "cantidad_ok", "talla_color_ok", "direccion_ok", "notas"].join(",")];
  for (const file of files) {
    const bytes = await readFile(path.join(args.input, file));
    const audio = { bytes, mime: AUDIO_TYPES[path.extname(file).toLowerCase()] };
    for (const name of active) {
      const started = Date.now();
      const result = await PROVIDERS[name].run(audio, prompt);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const text = "text" in result ? result.text : `ERROR: ${result.error ?? result.skipped}`;
      console.log(`${file} · ${PROVIDERS[name].label} (${seconds} s)\n  ${text}\n`);
      rows.push([file, PROVIDERS[name].label, seconds, text, "", "", "", "", ""].map(csv).join(","));
    }
  }
  await writeFile(args.out, rows.join("\n") + "\n");
  console.log(`Saved ${args.out}. Open it in Google Sheets and mark each row 1/0 per column.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
