"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ARCHIVED_STORE_READ_ONLY, canManageStore, canWriteToStore, getCurrentBusiness } from "@/lib/business";
import type { AddressForm, ChekelinInfo, ChekelinTextField } from "@/lib/types";
import { friendlyError } from "@/lib/dbErrors";
import { isShortMapsLink, normalizeStoreLocation, type StoreLocation } from "@/lib/storeLocation";
import { pinFromShortMapsLink } from "@/lib/storeLocationServer";
import { normalizeOpeningHours } from "@/lib/services";

const LIMITS: Record<ChekelinTextField, number> = {
  payment_methods: 2000,
  shipping: 2000,
  delivery_hours: 2000,
  returns_policy: 2000,
  faq: 4000,
};
const ADDRESS_FORMS: AddressForm[] = ["mirror", "tu", "vos", "usted"];

// Saves "Lo que chekelin sabe" of one Tienda. Dueños and its Gerentes only
// (checked here and again by the database's RLS). `location` (migration
// 0034) is left out until the database has its columns.
export async function saveChekelinInfo(
  storeId: string,
  input: ChekelinInfo,
  location?: StoreLocation,
): Promise<{ error?: string; location?: StoreLocation }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (!canManageStore(business, storeId)) return { error: "Solo el dueño o el gerente de la tienda puede cambiar esto." };
  if (!canWriteToStore(business, storeId)) return { error: ARCHIVED_STORE_READ_ONLY };

  const row: Record<string, string> = {};
  for (const [key, max] of Object.entries(LIMITS) as Array<[keyof typeof LIMITS, number]>) {
    const value = (input[key] ?? "").trim();
    if (value.length > max) return { error: `Un campo es muy largo (máximo ${max} letras).` };
    row[key] = value;
  }
  if (!ADDRESS_FORMS.includes(input.address_form)) return { error: "Opción de trato inválida." };
  // Tipo de negocio and Horario de atención (migration 0049), when sent.
  const extra: Record<string, unknown> = {};
  if (input.business_kind !== undefined) {
    if (input.business_kind !== "products" && input.business_kind !== "services") return { error: "Tipo de negocio inválido." };
    extra.business_kind = input.business_kind;
  }
  if (input.opening_hours !== undefined) {
    const hours = normalizeOpeningHours(input.opening_hours);
    if (hours.error) return { error: hours.error };
    extra.opening_hours = hours.hours;
  }

  let saved: StoreLocation | undefined;
  if (location) {
    const normalized = normalizeStoreLocation(location);
    if (!normalized.location) return { error: normalized.error };
    saved = normalized.location;
    // A "Compartir" link from the Maps app: read the pin behind it.
    if (saved.latitude === null && isShortMapsLink(saved.mapsUrl)) {
      const pin = await pinFromShortMapsLink(saved.mapsUrl);
      if (pin) saved = { ...saved, ...pin };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_chekelin_info")
    // business_id is filled by the database from the Tienda.
    .upsert(
      {
        store_id: storeId,
        business_id: business.id,
        ...row,
        address_form: input.address_form,
        ...extra,
        ...(saved
          ? {
              location_address: saved.address,
              location_maps_url: saved.mapsUrl,
              location_lat: saved.latitude,
              location_lng: saved.longitude,
            }
          : {}),
      },
      { onConflict: "store_id" },
    );
  if (error) return { error: friendlyError(error, "No se pudo guardar. Inténtalo de nuevo.") };
  revalidatePath("/chekelin");
  // The Tipo de negocio renames Catálogo in the menu.
  if (extra.business_kind) revalidatePath("/", "layout");
  return { location: saved };
}
