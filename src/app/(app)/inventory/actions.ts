"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";

export async function saveProduct(formData: FormData): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ponle un nombre al producto." };

  const category = String(formData.get("category") ?? "").trim() || null;
  const price = Math.max(0, Math.round(Number(formData.get("price") ?? 0)) || 0);
  const stock = Math.max(0, Math.round(Number(formData.get("stock") ?? 0)) || 0);
  const visible = formData.get("visible") === "on";
  const existingImageUrl = String(formData.get("existingImageUrl") ?? "").trim() || null;

  const supabase = await createClient();

  // Keep the existing photo unless a new file was actually chosen.
  let imageUrl = existingImageUrl;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const path = `${business.id}/${randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) return { error: `No se pudo subir la foto: ${uploadError.message}` };
    imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
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
  return {};
}
