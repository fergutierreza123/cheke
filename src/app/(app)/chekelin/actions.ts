"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageStore, getCurrentBusiness } from "@/lib/business";
import type { AddressForm, ChekelinInfo } from "@/lib/types";

const LIMITS: Record<keyof Omit<ChekelinInfo, "address_form">, number> = {
  payment_methods: 2000,
  shipping: 2000,
  delivery_hours: 2000,
  returns_policy: 2000,
  faq: 4000,
};
const ADDRESS_FORMS: AddressForm[] = ["mirror", "tu", "vos", "usted"];

// Saves "Lo que chekelin sabe" of one Tienda. Dueños and its Gerentes only
// (checked here and again by the database's RLS).
export async function saveChekelinInfo(storeId: string, input: ChekelinInfo): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (!canManageStore(business, storeId)) return { error: "Solo el dueño o el gerente de la tienda puede cambiar esto." };

  const row: Record<string, string> = {};
  for (const [key, max] of Object.entries(LIMITS) as Array<[keyof typeof LIMITS, number]>) {
    const value = (input[key] ?? "").trim();
    if (value.length > max) return { error: `Un campo es muy largo (máximo ${max} letras).` };
    row[key] = value;
  }
  if (!ADDRESS_FORMS.includes(input.address_form)) return { error: "Opción de trato inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_chekelin_info")
    // business_id is filled by the database from the Tienda.
    .upsert({ store_id: storeId, business_id: business.id, ...row, address_form: input.address_form }, { onConflict: "store_id" });
  if (error) return { error: error.message };
  revalidatePath("/chekelin");
  return {};
}
