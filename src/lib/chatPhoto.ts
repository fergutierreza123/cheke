import { JPEG_QUALITIES, photoPlan, pickedPhotoProblem, visualLimits } from "@/lib/outgoingVisual";
import type { ChannelType } from "@/lib/types";

// Browser-only: gets a photo picked (or just taken) in Chat ready to send.
// Big phone photos are redrawn at 1600 px as JPEG (see photoPlan), which
// also turns iPhone HEIC, WebP and GIF into a JPEG every network takes.

const HEIC_MESSAGE =
  "Este navegador no puede abrir fotos HEIC del iPhone. En el iPhone ve a Ajustes > Cámara > Formatos y elige «Más compatible», o abre cheke en Safari.";
const UNREADABLE_MESSAGE = "No se pudo leer la foto. Prueba con otra foto en JPG o PNG.";

type Drawable = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Drawable | null> {
  // createImageBitmap applies the EXIF rotation itself with "from-image".
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Older Safari decodes more formats (HEIC included) through <img>.
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

// Returns the file to upload, or a Spanish `error`. Never throws.
export async function prepareChatPhoto(
  file: File,
  mime: string,
  channelType: ChannelType | null | undefined,
): Promise<{ file?: File; error?: string }> {
  const tooBig = pickedPhotoProblem(file.size);
  if (tooBig) return { error: tooBig };
  const image = await decode(file);
  if (!image) return { error: /hei[cf]/i.test(mime) ? HEIC_MESSAGE : UNREADABLE_MESSAGE };
  try {
    const plan = photoPlan({ mime, size: file.size, width: image.width, height: image.height });
    if (!plan.redraw) return { file: file.type === mime ? file : new File([file], file.name, { type: mime }) };

    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: UNREADABLE_MESSAGE };
    // JPEG has no transparency: see-through PNG areas go white, not black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);

    const limit = visualLimits(channelType).image;
    for (const quality of JPEG_QUALITIES) {
      const blob = await toJpeg(canvas, quality);
      if (!blob) return { error: UNREADABLE_MESSAGE };
      if (blob.size <= limit) {
        const name = `${file.name.replace(/\.[^.]*$/, "") || "foto"}.jpg`;
        return { file: new File([blob], name, { type: "image/jpeg" }) };
      }
    }
    return { error: "La foto sigue siendo muy pesada. Prueba con otra foto." };
  } finally {
    image.close();
  }
}
