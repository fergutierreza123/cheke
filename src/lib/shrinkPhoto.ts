// Browser-only: shrinks a product photo before it is sent to a Server Action.
//
// Vercel rejects request bodies over 4.5 MB before our code even runs, and a
// full-size phone photo is often 3–8 MB. So we redraw the photo at most
// MAX_SIDE px on its long side and re-encode it as a JPEG (~0.5–1.5 MB).
// The server pipeline (src/lib/images.ts) also caps the final photo at
// 2048 px, so nothing visible is lost. The server treats this smaller JPEG
// as "the original" and still keeps its product pixels unchanged.

/** Same as OUTPUT_MAX_SIDE in src/lib/images.ts. */
const MAX_SIDE = 2048;
const JPEG_QUALITY = 0.9;
/** Keep well under Vercel's 4.5 MB request limit (the form has other fields too). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Small web-friendly photos are sent as-is, untouched. */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;
const WEB_TYPES = ["image/jpeg", "image/png", "image/webp"];

const HEIC_MESSAGE =
  "Este navegador no puede abrir fotos HEIC del iPhone. Abre la página en Safari, o en el iPhone ve a Ajustes > Cámara > Formatos y elige «Más compatible», y vuelve a subir la foto.";
const UNREADABLE_MESSAGE = "No se pudo leer la foto. Prueba con otra foto en formato JPG o PNG.";

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Drawable | null> {
  // createImageBitmap applies the EXIF rotation itself with "from-image".
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Some browsers (older Safari) decode more formats, HEIC included, via
    // <img> than via createImageBitmap. <img> also honours EXIF rotation.
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Returns a photo that is safe to upload, or a Spanish `error` to show the
 * user. Never throws.
 */
export async function shrinkPhotoForUpload(file: File): Promise<{ file?: File; error?: string }> {
  const image = await decode(file);
  if (!image) return { error: isHeic(file) ? HEIC_MESSAGE : UNREADABLE_MESSAGE };

  try {
    const longSide = Math.max(image.width, image.height);
    if (WEB_TYPES.includes(file.type) && file.size <= KEEP_AS_IS_BYTES && longSide <= MAX_SIDE) {
      return { file };
    }

    const scale = Math.min(1, MAX_SIDE / longSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: UNREADABLE_MESSAGE };
    // JPEG has no transparency: put see-through PNG areas on white, not black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);

    let blob = await toJpeg(canvas, JPEG_QUALITY);
    if (blob && blob.size > MAX_UPLOAD_BYTES) blob = await toJpeg(canvas, 0.8);
    if (!blob) return { error: UNREADABLE_MESSAGE };
    if (blob.size > MAX_UPLOAD_BYTES) return { error: "La foto sigue siendo muy pesada. Prueba con otra foto." };

    const name = `${file.name.replace(/\.[^.]*$/, "") || "foto"}.jpg`;
    return { file: new File([blob], name, { type: "image/jpeg" }) };
  } finally {
    image.close();
  }
}
