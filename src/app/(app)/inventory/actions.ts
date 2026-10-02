"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentBusiness } from "@/lib/business";
import { removeBackgroundToWhite } from "@/lib/images";

export async function saveProduct(formData: FormData): Promise<{ error?: string; photoWarning?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ponle un nombre al producto." };

  const category = String(formData.get("category") ?? "").trim() || null;
  // Rounds to cents only — `price_hnl` is numeric(12,2), and the old
  // Math.round() here was silently discarding decimals entirely.
  const priceRaw = Number(formData.get("price") ?? 0);
  const price = Math.max(0, Number.isFinite(priceRaw) ? Math.round(priceRaw * 100) / 100 : 0);
  const stock = Math.max(0, Math.round(Number(formData.get("stock") ?? 0)) || 0);
  const visible = formData.get("visible") === "on";
  const existingImageUrl = String(formData.get("existingImageUrl") ?? "").trim() || null;

  const supabase = await createClient();

  // Keep the existing photo unless a new file was actually chosen.
  let imageUrl = existingImageUrl;
  let photoWarning: string | undefined;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    // Cut the product out onto a clean white background before storing it,
    // so photos look consistent without the founder needing a photo editor.
    // If this fails for any reason (no key, quota, network), fall back to
    // the original photo rather than blocking the whole save over it.
    let uploadBody: Blob = file;
    let contentType = file.type;
    const bg = await removeBackgroundToWhite(file);
    if (bg.blob) {
      uploadBody = bg.blob;
      contentType = bg.blob.type || "image/png";
    } else if (bg.error) {
      photoWarning = `Se guardó la foto original: ${bg.error}`;
    }

    // Storage RLS on `storage.objects` (0009_product_images.sql) is scoped
    // per-business, but the storage REST API doesn't reliably see this
    // Server Action's user session the way PostgREST table queries do.
    // Membership is already confirmed above via getCurrentBusiness(), so
    // use the admin client for just this write — same pattern as the
    // WhatsApp webhook (src/app/api/whatsapp/webhook/route.ts).
    const adminSupabase = createAdminClient();
    const path = `${business.id}/${randomUUID()}-${file.name}`;
    const { error: uploadError } = await adminSupabase.storage
      .from("product-images")
      .upload(path, uploadBody, { contentType, upsert: true });
    if (uploadError) return { error: `No se pudo subir la foto: ${uploadError.message}` };
    imageUrl = adminSupabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  }

  if (id) {
    const { error } = await supabase
      .from("products")
      .update({ name, category, price_hnl: price, stock, visible, image_url: imageUrl })
      .eq("id", id)
      .eq("business_id", business.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("products").insert({
      business_id: business.id,
      retailer_id: randomUUID(),
      name,
      category,
      price_hnl: price,
      stock,
      visible,
      image_url: imageUrl,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/inventory");
  return { photoWarning };
}
