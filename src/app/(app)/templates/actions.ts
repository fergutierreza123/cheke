"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { TEMPLATE_CATEGORY_ORDER } from "@/lib/format";
import type { TemplateCategory } from "@/lib/types";
import { friendlyError } from "@/lib/dbErrors";

const NAME_MAX = 60;
// The longest text message WhatsApp sends.
const BODY_MAX = 4096;

export async function saveTemplate(formData: FormData): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role === "agent") return { error: "Solo el dueño o un gerente puede editar plantillas." };

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "precios") as TemplateCategory;

  if (!name || !body) return { error: "Ponle un nombre y un mensaje a la plantilla." };
  if (name.length > NAME_MAX) return { error: `El nombre es muy largo (máximo ${NAME_MAX} letras).` };
  if (body.length > BODY_MAX) return { error: `El mensaje es muy largo (máximo ${BODY_MAX} letras).` };
  if (!TEMPLATE_CATEGORY_ORDER.includes(category)) return { error: "Elige una categoría." };

  const supabase = await createClient();

  // Saving a Sugerencia de chekelin (as proposed or edited) approves it.
  const suggestionId = String(formData.get("suggestion_id") ?? "").trim() || null;
  if (suggestionId) {
    const { data: pending } = await supabase
      .from("template_suggestions")
      .select("id")
      .eq("id", suggestionId)
      .eq("business_id", business.id)
      .eq("status", "pending")
      .maybeSingle();
    if (!pending) return { error: "Esta sugerencia ya se revisó." };
  }

  // The Plantilla first: if it can't be saved, the Sugerencia stays pending
  // instead of being marked approved without a Plantilla.
  if (id) {
    const { data: updated, error } = await supabase
      .from("templates")
      .update({ name, category, body })
      .eq("id", id)
      .eq("business_id", business.id)
      .select("id");
    if (error) return { error: friendlyError(error, "No se pudo guardar la plantilla. Inténtalo de nuevo.") };
    if (!updated?.length) return { error: "No se encontró la plantilla. Recarga la página." };
  } else {
    const { error } = await supabase
      .from("templates")
      .insert({ business_id: business.id, name, category, body });
    if (error) return { error: friendlyError(error, "No se pudo guardar la plantilla. Inténtalo de nuevo.") };
  }

  if (suggestionId) {
    const { error } = await supabase
      .from("template_suggestions")
      .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: business.userId })
      .eq("id", suggestionId)
      .eq("business_id", business.id)
      .eq("status", "pending");
    if (error) console.error("template suggestion approve error", error.message);
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
  if (error) return { error: friendlyError(error, "No se pudo descartar la sugerencia.") };
  revalidatePath("/templates");
  return {};
}
