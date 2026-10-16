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

  // Saving a Sugerencia de chekelin (as proposed or edited) approves it.
  const suggestionId = String(formData.get("suggestion_id") ?? "").trim() || null;
  if (suggestionId) {
    if (business.role === "agent") return { error: "Solo el dueño o un gerente puede aprobar sugerencias." };
    const { data: decided, error } = await supabase
      .from("template_suggestions")
      .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: business.userId })
      .eq("id", suggestionId)
      .eq("business_id", business.id)
      .eq("status", "pending")
      .select("id");
    if (error) return { error: error.message };
    if (!decided?.length) return { error: "Esta sugerencia ya se revisó." };
  }

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

// "Descartar" on a Sugerencia de chekelin: never becomes a Plantilla, and
// chekelin won't propose it again.
export async function dismissSuggestion(suggestionId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role === "agent") return { error: "Solo el dueño o un gerente puede revisar sugerencias." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("template_suggestions")
    .update({ status: "dismissed", decided_at: new Date().toISOString(), decided_by: business.userId })
    .eq("id", suggestionId)
    .eq("business_id", business.id)
    .eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath("/templates");
  return {};
}
