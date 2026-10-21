"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { friendlyError } from "@/lib/dbErrors";

const NAME_MAX = 100;
const NOTES_MAX = 2000;

export async function saveContact(formData: FormData): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "Ponle un nombre al contacto." };
  if (name.length > NAME_MAX) return { error: `El nombre es muy largo (máximo ${NAME_MAX} letras).` };

  const phone = String(formData.get("phone") ?? "").trim() || null;
  const ig_handle = String(formData.get("ig_handle") ?? "").trim() || null;
  const fb_id = String(formData.get("fb_id") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (notes && notes.length > NOTES_MAX) return { error: `Las notas son muy largas (máximo ${NOTES_MAX} letras).` };

  const supabase = await createClient();

  if (id) {
    const { data: updated, error } = await supabase
      .from("contacts")
      .update({ name, phone, ig_handle, fb_id, notes })
      .eq("id", id)
      .eq("business_id", business.id)
      .select("id");
    if (error) return { error: friendlyError(error, "No se pudo guardar el contacto. Inténtalo de nuevo.") };
    if (!updated?.length) return { error: "No se encontró el contacto. Recarga la página." };
  } else {
    const { error } = await supabase
      .from("contacts")
      .insert({ business_id: business.id, name, phone, ig_handle, fb_id, notes });
    if (error) return { error: friendlyError(error, "No se pudo guardar el contacto. Inténtalo de nuevo.") };
  }

  revalidatePath("/contacts");
  return {};
}
