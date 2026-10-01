// Product photo background removal, via remove.bg — composites the cutout
// straight onto a white background server-side, so uploaded product photos
// look consistent/professional without the founder needing a photo editor.
// Server-only (uses a secret API key).

const REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg";

export async function removeBackgroundToWhite(file: File): Promise<{ blob?: Blob; error?: string }> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) return { error: "Falta configurar REMOVE_BG_API_KEY en el servidor." };

  const form = new FormData();
  form.append("image_file", file);
  form.append("size", "auto");
  form.append("bg_color", "FFFFFF");

  try {
    const response = await fetch(REMOVE_BG_ENDPOINT, {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: form,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { error: `remove.bg respondió ${response.status}: ${text.slice(0, 200)}` };
    }
    return { blob: await response.blob() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error al contactar remove.bg." };
  }
}
