"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import type { TemplateCategory } from "@/lib/types";

export async function saveTemplate(formData: FormData): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "precios") as TemplateCategory;

  if (!name || !body) return { error: "Ponle un nombre y un mensaje a la plantilla." };

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("templates")
      .update({ name, category, body })
      .eq("id", id)
      .eq("business_id", business.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("templates")
      .insert({ business_id: business.id, name, category, body });
    if (error) return { error: error.message };
  }

  revalidatePath("/templates");
  return {};
}
