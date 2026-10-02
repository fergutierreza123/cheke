"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";

export async function saveContact(formData: FormData): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ponle un nombre al contacto." };

  const phone = String(formData.get("phone") ?? "").trim() || null;
  const ig_handle = String(formData.get("ig_handle") ?? "").trim() || null;
  const fb_id = String(formData.get("fb_id") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("contacts")
      .update({ name, phone, ig_handle, fb_id, notes })
      .eq("id", id)
      .eq("business_id", business.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("contacts")
      .insert({ business_id: business.id, name, phone, ig_handle, fb_id, notes });
    if (error) return { error: error.message };
  }

  revalidatePath("/contacts");
  return {};
}
