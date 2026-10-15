"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canAccessStore, getCurrentBusiness, STORE_COOKIE, type StoreSelection } from "@/lib/business";
import { canOpenAnotherStore } from "@/lib/plan";
import { unsubscribeMetaPage, unsubscribeWhatsApp } from "../channels/channelHelpers";

const NAME_MAX = 60;

// The store selector (and "Ver historial" of an archived Tienda): which
// Tienda every screen shows, remembered in a cookie for a year.
export async function selectStore(selection: StoreSelection): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (selection !== "all" && !canAccessStore(business, selection)) return { error: "No tienes acceso a esa tienda." };

  (await cookies()).set(STORE_COOKIE, selection, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
  return {};
}

function cleanName(raw: string): { name?: string; error?: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Ponle un nombre a la tienda." };
  if (name.length > NAME_MAX) return { error: `El nombre es muy largo (máximo ${NAME_MAX} letras).` };
  return { name };
}

async function ownerOnly() {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." } as const;
  if (business.role !== "owner") return { error: "Solo el dueño puede administrar las tiendas." } as const;
  return { business } as const;
}

// "Agregar tienda". The plan limit (issue #9) plugs in at canOpenAnotherStore.
export async function createStore(rawName: string): Promise<{ error?: string; storeId?: string }> {
  const owner = await ownerOnly();
  if ("error" in owner) return { error: owner.error };
  const { business } = owner;
  const { name, error: nameError } = cleanName(rawName);
  if (!name) return { error: nameError };
  if (!canOpenAnotherStore(business.plan, business.stores.length)) {
    return { error: "Tu plan no permite más tiendas." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .insert({ business_id: business.id, name })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "No se pudo crear la tienda." };

  revalidatePath("/", "layout");
  return { storeId: data.id };
}

export async function renameStore(storeId: string, rawName: string): Promise<{ error?: string }> {
  const owner = await ownerOnly();
  if ("error" in owner) return { error: owner.error };
  const { name, error: nameError } = cleanName(rawName);
  if (!name) return { error: nameError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ name })
    .eq("id", storeId)
    .eq("business_id", owner.business.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

// Closing a Tienda archives it: hidden from daily use, its channels
// disconnected (so no new messages arrive there), its history kept for
// Dueños, reopenable. The last open Tienda can't be archived.
export async function archiveStore(storeId: string): Promise<{ error?: string }> {
  const owner = await ownerOnly();
  if ("error" in owner) return { error: owner.error };
  const { business } = owner;
  if (!business.stores.some((s) => s.id === storeId)) return { error: "No se encontró la tienda." };
  if (business.stores.length < 2) return { error: "Tu negocio necesita al menos una tienda abierta." };

  const supabase = await createClient();
  const { data: channels } = await supabase
    .from("channels")
    .select("id, type, waba_id, page_id, access_token_encrypted")
    .eq("business_id", business.id)
    .eq("store_id", storeId)
    .eq("status", "connected");
  const pages = new Set<string>();
  for (const c of channels ?? []) {
    if (c.type === "whatsapp") await unsubscribeWhatsApp(c);
    else if (c.page_id && !pages.has(c.page_id)) {
      pages.add(c.page_id);
      await unsubscribeMetaPage(c.page_id, c.access_token_encrypted);
    }
  }
  const { error: channelError } = await supabase
    .from("channels")
    .update({ status: "disconnected", access_token_encrypted: null, registration_pin_encrypted: null })
    .eq("business_id", business.id)
    .eq("store_id", storeId);
  if (channelError) return { error: channelError.message };

  const { error } = await supabase
    .from("stores")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", storeId)
    .eq("business_id", business.id);
  if (error) return { error: error.message };

  // Whoever had it selected goes back to the default view.
  const jar = await cookies();
  if (jar.get(STORE_COOKIE)?.value === storeId) jar.delete(STORE_COOKIE);
  revalidatePath("/", "layout");
  return {};
}

// Reopens an archived Tienda. Its channels stay disconnected until someone
// connects them again in Canales.
export async function reopenStore(storeId: string): Promise<{ error?: string }> {
  const owner = await ownerOnly();
  if ("error" in owner) return { error: owner.error };
  const { business } = owner;
  if (!business.archivedStores.some((s) => s.id === storeId)) return { error: "No se encontró la tienda." };
  if (!canOpenAnotherStore(business.plan, business.stores.length)) {
    return { error: "Tu plan no permite más tiendas." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ archived_at: null })
    .eq("id", storeId)
    .eq("business_id", business.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

// Catálogo's "Copiar a otra tienda": the same product (photo included) in
// another Tienda's catalog, as an independent copy with its own stock.
export async function copyProductToStore(productId: string, targetStoreId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (!business.stores.some((s) => s.id === targetStoreId)) return { error: "No tienes acceso a esa tienda." };

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("store_id, retailer_id, name, description, category, price_hnl, image_url, stock, visible")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!product) return { error: "No se encontró el producto." };
  if (product.store_id === targetStoreId) return { error: "El producto ya está en esa tienda." };

  const { error } = await supabase.from("products").insert({
    ...product,
    business_id: business.id,
    store_id: targetStoreId,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ese producto ya está en esa tienda." };
    return { error: error.message };
  }
  revalidatePath("/inventory");
  return {};
}
