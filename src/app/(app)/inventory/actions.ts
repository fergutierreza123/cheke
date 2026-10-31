"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ARCHIVED_STORE_READ_ONLY, canWriteToStore, getCurrentBusiness, writableStoreIds } from "@/lib/business";
import { isOwnStorageUrl } from "@/lib/storageUrl";
import { removeBackgroundToWhite } from "@/lib/images";
import { friendlyError } from "@/lib/dbErrors";
import { parseLempiras } from "@/lib/format";
import { SERVICE_DURATIONS } from "@/lib/services";

// Matches src/lib/shrinkPhoto.ts, which keeps uploads under Vercel's 4.5 MB
// request limit. (Not imported: a "use server" file may only export actions.)
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];
// WhatsApp's catalog (Meta Commerce) cuts product names at 150 characters.
const NAME_MAX = 150;
const PRICE_MAX = 10_000_000;

export async function saveProduct(formData: FormData): Promise<{ error?: string; photoWarning?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  // Catálogo always shows one Tienda: new products go to that one.
  const storeId = business.selectedStore?.id;
  if (!storeId) return { error: "Elige una tienda para ver su catálogo." };
  if (!canWriteToStore(business, storeId)) return { error: ARCHIVED_STORE_READ_ONLY };

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const services = Boolean(business.selectedStore?.services);
  if (!name) return { error: services ? "Ponle un nombre al servicio." : "Ponle un nombre al producto." };
  if (name.length > NAME_MAX) return { error: `El nombre es muy largo (máximo ${NAME_MAX} letras).` };

  const category = String(formData.get("category") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  // "1,500.50", "1500,50" (Spanish keyboards) or empty (L 0, price to be
  // confirmed), rounded to cents. Anything else is refused instead of
  // being saved as L 0 without a word.
  const priceText = String(formData.get("price") ?? "").trim();
  const price = priceText ? parseLempiras(priceText) : 0;
  if (price === null || price > PRICE_MAX) return { error: "Escribe un precio válido en Lempiras, por ejemplo 1,500." };
  const visible = formData.get("visible") === "on";
  // A Servicio needs how long it takes (the Citas use it); products have none.
  const durationMin = services ? Number(formData.get("duration_min")) : null;
  if (durationMin !== null && !SERVICE_DURATIONS.includes(durationMin)) return { error: "Elige cuánto dura el servicio." };
  // The photo the product already had. Only our own storage: the browser
  // could send any address, and this photo goes out to customers.
  const existingImageUrl = String(formData.get("existingImageUrl") ?? "").trim() || null;
  if (existingImageUrl && !isOwnStorageUrl(existingImageUrl)) return { error: "La foto no es válida." };

  const supabase = await createClient();

  // Keep the existing photo unless a new file was actually chosen.
  let imageUrl = existingImageUrl;
  let photoWarning: string | undefined;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    // The browser already shrinks photos (src/lib/shrinkPhoto.ts); this is
    // the server-side check in case something else posts here.
    if (!UPLOAD_TYPES.includes(file.type)) {
      return { error: "Formato de foto no soportado. Usa una foto JPG, PNG o WebP." };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { error: "La foto pesa más de 4 MB. Prueba con otra foto." };
    }
    // Cut the product out onto a clean white background before storing it,
    // so photos look consistent without the founder needing a photo editor.
    // If this fails for any reason (no key, quota, network), fall back to
    // the original photo rather than blocking the whole save over it.
    let uploadBody: Blob = file;
    let contentType = file.type;
    let fileName = file.name;
    const bg = await removeBackgroundToWhite(file);
    if (bg.blob) {
      uploadBody = bg.blob;
      contentType = bg.blob.type || "image/jpeg";
      // The processed photo is always a JPEG, whatever the original was.
      fileName = `${file.name.replace(/\.[^.]*$/, "")}.jpg`;
    } else if (bg.error) {
      photoWarning = "No se pudo quitar el fondo: se guardó la foto original.";
    }

    // Storage RLS on `storage.objects` (0009_product_images.sql) is scoped
    // per-business, but the storage REST API doesn't reliably see this
    // Server Action's user session the way PostgREST table queries do.
    // Membership is already confirmed above via getCurrentBusiness(), so
    // use the admin client for just this write — same pattern as the
    // WhatsApp webhook (src/app/api/whatsapp/webhook/route.ts).
    const adminSupabase = createAdminClient();
    const path = `${business.id}/${randomUUID()}-${fileName}`;
    const { error: uploadError } = await adminSupabase.storage
      .from("product-images")
      .upload(path, uploadBody, { contentType, upsert: true });
    if (uploadError) return { error: friendlyError(uploadError, "No se pudo subir la foto. Inténtalo de nuevo.") };
    imageUrl = adminSupabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  }

  if (id) {
    const { data: updated, error } = await supabase
      .from("products")
      .update({ name, category, description, price_hnl: price, visible, image_url: imageUrl, ...(services ? { duration_min: durationMin } : {}) })
      .eq("id", id)
      .eq("business_id", business.id)
      .eq("store_id", storeId)
      .select("id");
    if (error) return { error: friendlyError(error, "No se pudo guardar el producto. Inténtalo de nuevo.") };
    if (!updated?.length) return { error: "No se encontró el producto. Recarga la página." };
  } else {
    const { error } = await supabase.from("products").insert({
      business_id: business.id,
      store_id: storeId,
      retailer_id: randomUUID(),
      name,
      category,
      description,
      price_hnl: price,
      visible,
      image_url: imageUrl,
      ...(services ? { duration_min: durationMin } : {}),
    });
    if (error) return { error: friendlyError(error, "No se pudo guardar el producto. Inténtalo de nuevo.") };
  }

  revalidatePath("/inventory");
  return { photoWarning };
}

export async function deleteProduct(id: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const supabase = await createClient();
  // Only products of open Tiendas: an archived Tienda's catalog is read-only.
  const { data: deleted, error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id)
    .in("store_id", writableStoreIds(business))
    .select("id");
  if (error) return { error: friendlyError(error, "No se pudo eliminar el producto.") };
  if (!deleted?.length) return { error: "No se encontró el producto. Recarga la página." };

  revalidatePath("/inventory");
  return {};
}
