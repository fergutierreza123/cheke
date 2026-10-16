// Product photo pipeline: puts the product on a clean white background
// WITHOUT letting any vendor redraw the product itself.
//
// Background-removal vendors also "correct" colours at the edges of the
// product (see docs/research/background-removal-tools.md). So we only ask
// the vendor for an alpha MASK (where the product is), and paint our own,
// original pixels onto white ourselves. Wherever the mask is fully opaque
// the output pixel is byte-for-byte the photo's pixel, and we check that
// before using the result.
//
// The vendor sits behind one small interface (BackgroundRemovalProvider),
// picked with the BG_REMOVAL_PROVIDER env var, so the winner of the photo
// test (issue #11) can be swapped in without touching the pipeline.
//
// Server-only (uses secret API keys). This file intentionally has no local
// imports so `scripts/compare-photo-providers.mjs` can run it directly with
// Node, outside Next.js.

import sharp from "sharp";

/** Longest side of the final product photo. Plenty for WhatsApp/Meta catalogs. */
export const OUTPUT_MAX_SIDE = 2048;
/** Longest side of the copy sent to the vendor (keeps requests ~1 MB, well under Vercel's 4.5 MB). */
export const VENDOR_MAX_SIDE = 1600;
const OUTPUT_JPEG_QUALITY = 90;
/** If the mask keeps less than this share of the photo, segmentation probably failed. */
const MIN_PRODUCT_COVERAGE = 0.02;

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export type ProviderName = "removebg" | "photoroom" | "pixian";
export const PROVIDER_NAMES: ProviderName[] = ["removebg", "photoroom", "pixian"];

export interface BackgroundRemovalProvider {
  name: ProviderName;
  /** Human-readable reason the provider can't run (missing key), or null when ready. */
  missingConfig(): string | null;
  /**
   * Sends `image` (a small JPEG) and returns an image whose alpha channel —
   * or, for a plain grayscale image, its brightness — is the product mask.
   * Throws on any vendor error.
   */
  fetchMask(image: Buffer): Promise<Buffer>;
}

async function postForImage(vendor: string, url: string, init: RequestInit): Promise<Buffer> {
  const response = await fetch(url, { ...init, method: "POST", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${vendor} respondió ${response.status}: ${text.slice(0, 200)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function jpegBlob(image: Buffer): Blob {
  return new Blob([new Uint8Array(image)], { type: "image/jpeg" });
}

// remove.bg: `channels=alpha` asks for the grayscale matte only (no edge
// colour "corrections"). If it ever returns an RGBA cutout instead, the
// pipeline just reads that cutout's alpha channel.
const removeBg: BackgroundRemovalProvider = {
  name: "removebg",
  missingConfig: () => (process.env.REMOVE_BG_API_KEY ? null : "Falta configurar REMOVE_BG_API_KEY en el servidor."),
  async fetchMask(image) {
    const form = new FormData();
    form.append("image_file", jpegBlob(image), "photo.jpg");
    form.append("size", "auto");
    form.append("format", "png");
    form.append("channels", "alpha");
    return postForImage("remove.bg", "https://api.remove.bg/v1.0/removebg", {
      headers: { "X-Api-Key": process.env.REMOVE_BG_API_KEY ?? "" },
      body: form,
    });
  },
};

// Photoroom Remove Background (Basic plan). We take the alpha channel of the
// transparent PNG cutout: Photoroom's docs say its `channels=alpha` mask skips
// the matting step, so the cutout's alpha has the cleaner edges. Never add
// `despill` or any "AI" option here — those can alter the product.
const photoroom: BackgroundRemovalProvider = {
  name: "photoroom",
  missingConfig: () => (process.env.PHOTOROOM_API_KEY ? null : "Falta configurar PHOTOROOM_API_KEY en el servidor."),
  async fetchMask(image) {
    const form = new FormData();
    form.append("image_file", jpegBlob(image), "photo.jpg");
    form.append("format", "png");
    return postForImage("Photoroom", "https://sdk.photoroom.com/v1/segment", {
      headers: { "x-api-key": process.env.PHOTOROOM_API_KEY ?? "" },
      body: form,
    });
  },
};

// Pixian.ai. Returns a transparent PNG cutout; we keep only its alpha.
// PIXIAN_TEST=true uses Pixian's free (watermarked) test mode.
const pixian: BackgroundRemovalProvider = {
  name: "pixian",
  missingConfig: () =>
    process.env.PIXIAN_API_ID && process.env.PIXIAN_API_SECRET
      ? null
      : "Falta configurar PIXIAN_API_ID y PIXIAN_API_SECRET en el servidor.",
  async fetchMask(image) {
    const form = new FormData();
    form.append("image", jpegBlob(image), "photo.jpg");
    if (process.env.PIXIAN_TEST === "true") form.append("test", "true");
    const credentials = Buffer.from(`${process.env.PIXIAN_API_ID}:${process.env.PIXIAN_API_SECRET}`).toString("base64");
    return postForImage("Pixian", "https://api.pixian.ai/api/v2/remove-background", {
      headers: { Authorization: `Basic ${credentials}` },
      body: form,
    });
  },
};

const PROVIDERS: Record<ProviderName, BackgroundRemovalProvider> = { removebg: removeBg, photoroom, pixian };

/** The provider named by `name`, else BG_REMOVAL_PROVIDER, else remove.bg. */
export function getBackgroundRemovalProvider(name?: string): BackgroundRemovalProvider {
  const wanted = (name ?? process.env.BG_REMOVAL_PROVIDER ?? "removebg").trim().toLowerCase();
  const provider = PROVIDERS[wanted as ProviderName];
  if (!provider) throw new Error(`BG_REMOVAL_PROVIDER desconocido: "${wanted}". Usa: ${PROVIDER_NAMES.join(", ")}.`);
  return provider;
}

// ---------------------------------------------------------------------------
// Compositing
// ---------------------------------------------------------------------------

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

/** "The original": EXIF-rotated, sRGB, no alpha, shrunk (never enlarged) to OUTPUT_MAX_SIDE. */
export async function normalizePhoto(input: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(OUTPUT_MAX_SIDE, OUTPUT_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`Formato de color inesperado (${info.channels} canales).`);
  return { data, width: info.width, height: info.height };
}

/** Small JPEG copy of the original for the vendor. */
export async function vendorCopy(original: RawImage): Promise<Buffer> {
  return sharp(original.data, { raw: { width: original.width, height: original.height, channels: 3 } })
    .resize(VENDOR_MAX_SIDE, VENDOR_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Turns a vendor result (RGBA cutout or grayscale matte) into a 1-channel mask at the original's size. */
export async function maskFromVendorImage(vendorImage: Buffer, width: number, height: number): Promise<Buffer> {
  const image = sharp(vendorImage);
  const { hasAlpha } = await image.metadata();
  // A cutout carries the mask in its alpha channel. A grayscale matte carries
  // it in its brightness (and may still have a fully opaque alpha channel).
  let alphaIsMask = false;
  if (hasAlpha) {
    const { channels } = await image.stats();
    alphaIsMask = channels[channels.length - 1].min < 255;
  }
  const singleChannel = alphaIsMask ? image.extractChannel("alpha") : image.greyscale().extractChannel(0);
  const { data, info } = await singleChannel
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || data.length !== width * height) throw new Error("La máscara no tiene el tamaño esperado.");
  return data;
}

/** Original pixels over pure white, weighted by the mask: out = (orig·a + 255·(255−a)) / 255. */
export async function compositeOnWhite(original: RawImage, mask: Buffer): Promise<Buffer> {
  const { width, height } = original;
  // Two separate sharp pipelines on purpose: within one pipeline sharp runs
  // flatten() before joinChannel(), so the white background would never apply.
  const rgba = await sharp(original.data, { raw: { width, height, channels: 3 } })
    .joinChannel(mask, { raw: { width, height, channels: 1 } })
    .raw()
    .toBuffer();
  const { data, info } = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`Composición inesperada (${info.channels} canales).`);
  return data;
}

/** Number of pixels where the mask is fully opaque but the composite differs from the original. Must be 0. */
export function countChangedOpaquePixels(original: RawImage, mask: Buffer, composite: Buffer): number {
  let changed = 0;
  for (let p = 0, i = 0; p < mask.length; p++, i += 3) {
    if (
      mask[p] === 255 &&
      (composite[i] !== original.data[i] ||
        composite[i + 1] !== original.data[i + 1] ||
        composite[i + 2] !== original.data[i + 2])
    ) {
      changed++;
    }
  }
  return changed;
}

function productCoverage(mask: Buffer): number {
  let kept = 0;
  for (let p = 0; p < mask.length; p++) if (mask[p] >= 128) kept++;
  return kept / mask.length;
}

export async function encodeJpeg(image: RawImage): Promise<Buffer> {
  return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 3 } })
    .jpeg({ quality: OUTPUT_JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/**
 * Builds the white-background JPEG from an original photo and a mask image
 * (whatever the vendor returned). Throws if the "product unchanged" check
 * fails or the mask looks like a failed segmentation.
 */
export async function composeProductPhoto(original: RawImage, vendorImage: Buffer): Promise<Buffer> {
  const mask = await maskFromVendorImage(vendorImage, original.width, original.height);
  const coverage = productCoverage(mask);
  if (coverage < MIN_PRODUCT_COVERAGE) {
    throw new Error(`No se detectó el producto (máscara cubre ${(coverage * 100).toFixed(1)}% de la foto).`);
  }
  const composite = await compositeOnWhite(original, mask);
  const changed = countChangedOpaquePixels(original, mask, composite);
  if (changed > 0) {
    throw new Error(`Verificación fallida: ${changed} píxeles del producto cambiaron.`);
  }
  return encodeJpeg({ data: composite, width: original.width, height: original.height });
}

/** Full pipeline: original photo bytes in, white-background JPEG out. Throws on any failure. */
export async function processProductPhoto(input: Buffer, provider: BackgroundRemovalProvider): Promise<Buffer> {
  const missing = provider.missingConfig();
  if (missing) throw new Error(missing);
  const original = await normalizePhoto(input);
  const vendorImage = await provider.fetchMask(await vendorCopy(original));
  return composeProductPhoto(original, vendorImage);
}

/**
 * Used by the Catálogo upload. Never throws: on any problem it returns an
 * `error` and the caller keeps the original photo as uploaded.
 */
export async function removeBackgroundToWhite(file: File): Promise<{ blob?: Blob; error?: string }> {
  try {
    const provider = getBackgroundRemovalProvider();
    const output = await processProductPhoto(Buffer.from(await file.arrayBuffer()), provider);
    return { blob: new Blob([new Uint8Array(output)], { type: "image/jpeg" }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al quitar el fondo.";
    console.warn(`[product-photo] using original photo: ${message}`);
    return { error: message };
  }
}
