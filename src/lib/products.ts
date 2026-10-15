import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

// The catalog of the given Tiendas (each Tienda has its own).
export async function getProducts(businessId: string, storeIds: string[]): Promise<Product[]> {
  if (storeIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .in("store_id", storeIds)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
