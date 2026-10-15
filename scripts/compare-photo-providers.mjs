// Runs the product-photo pipeline (src/lib/images.ts) on a folder of photos
// with one or more background-removal vendors, and writes, for each photo:
//   <name>.<provider>.jpg               the white-background result
//   <name>.<provider>.side-by-side.jpg  original | result, for comparing
// This is the tool for the founder's photo test (issue #11).
//
// Usage (from the repo root, Node 22.18+ / 24):
//   npm run compare-photos -- <photos-folder> [--provider removebg|photoroom|pixian|all|fake] [--out <folder>]
//
// API keys are read from .env.local (same names as on Vercel). `--provider
// fake` needs no key: it uses an oval mask, to check the pipeline itself.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  PROVIDER_NAMES,
  composeProductPhoto,
  getBackgroundRemovalProvider,
  normalizePhoto,
  vendorCopy,
} from "../src/lib/images.ts";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".tif", ".tiff"]);

function parseArgs(argv) {
  const args = { input: null, provider: "all", out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--provider") args.provider = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (!args.input) args.input = argv[i];
  }
  return args;
}

/** Oval mask covering the middle of the photo: a stand-in vendor for testing without keys. */
const fakeProvider = {
  name: "fake",
  missingConfig: () => null,
  async fetchMask(image) {
    const { width, height } = await sharp(image).metadata();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="black"/>
      <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.35}" ry="${height * 0.4}" fill="white"/>
    </svg>`;
    return sharp(Buffer.from(svg)).greyscale().png().toBuffer();
  },
};

async function sideBySide(left, right) {
  const a = await sharp(left).rotate().resize({ height: 800 }).jpeg().toBuffer({ resolveWithObject: true });
  const b = await sharp(right).resize({ height: 800 }).jpeg().toBuffer({ resolveWithObject: true });
  const gap = 16;
  return sharp({
    create: { width: a.info.width + gap + b.info.width, height: 800, channels: 3, background: "#888888" },
  })
    .composite([
      { input: a.data, left: 0, top: 0 },
      { input: b.data, left: a.info.width + gap, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: node scripts/compare-photo-providers.mjs <photos-folder> [--provider removebg|photoroom|pixian|all|fake] [--out <folder>]");
    process.exit(1);
  }
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const names = args.provider === "all" ? PROVIDER_NAMES : [args.provider];
  const providers = names.map((name) => (name === "fake" ? fakeProvider : getBackgroundRemovalProvider(name)));
  const ready = providers.filter((p) => {
    const missing = p.missingConfig();
    if (missing) console.warn(`Skipping ${p.name}: ${missing}`);
    return !missing;
  });
  if (ready.length === 0) {
    console.error("No provider has its API key set. Add the keys to .env.local, or try --provider fake.");
    process.exit(1);
  }

  const outDir = args.out ?? path.join(args.input, "results");
  await mkdir(outDir, { recursive: true });
  const files = (await readdir(args.input)).filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()));
  if (files.length === 0) console.warn(`No photos found in ${args.input}`);

  for (const file of files) {
    const input = await readFile(path.join(args.input, file));
    const base = path.parse(file).name;
    let original;
    try {
      original = await normalizePhoto(input);
    } catch (error) {
      console.error(`${file}: can't read this photo (${error.message})`);
      continue;
    }
    const small = await vendorCopy(original);
    for (const provider of ready) {
      const started = Date.now();
      try {
        const result = await composeProductPhoto(original, await provider.fetchMask(small));
        await writeFile(path.join(outDir, `${base}.${provider.name}.jpg`), result);
        await writeFile(path.join(outDir, `${base}.${provider.name}.side-by-side.jpg`), await sideBySide(input, result));
        console.log(`${file} [${provider.name}] ok in ${Date.now() - started} ms, product pixels unchanged`);
      } catch (error) {
        console.error(`${file} [${provider.name}] FAILED (the app would keep the original photo): ${error.message}`);
      }
    }
  }
  console.log(`Results in ${outDir}`);
}

main();
