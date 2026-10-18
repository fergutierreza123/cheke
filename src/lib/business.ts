import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { STORE_COOKIE, type CurrentBusiness, type Role, type StoreRef, type StoreSelection } from "@/lib/stores";

export {
  ARCHIVED_STORE_READ_ONLY,
  ROLE_LABEL,
  STORE_COOKIE,
  canAccessStore,
  canManageStore,
  canWriteToStore,
  storeNamesForTags,
  type CurrentBusiness,
  type Role,
  type StoreRef,
  type StoreSelection,
} from "@/lib/stores";

// Looks up the Negocio the signed-in person belongs to (one per person at
// launch), their role, their Tiendas and the one picked in the selector
// (cookie). Cached per request, so the layout and the page share one
// lookup. Returns null when they are logged in but haven't created or
// joined a Negocio yet.
export const getCurrentBusiness = cache(async (): Promise<CurrentBusiness | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("members")
    .select("role, businesses(id, name, plan)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.businesses) return null;

  const business = Array.isArray(data.businesses) ? data.businesses[0] : data.businesses;
  if (!business) return null;
  const role = data.role as Role;

  const [{ data: storeRows }, { data: mine }] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, archived_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: true }),
    supabase.from("store_members").select("store_id").eq("user_id", user.id),
  ]);

  const allStores: StoreRef[] = (storeRows ?? []).map((s) => ({ id: s.id, name: s.name, archived: Boolean(s.archived_at) }));
  const memberOf = new Set((mine ?? []).map((m) => m.store_id as string));
  const open = allStores.filter((s) => !s.archived);
  const stores = role === "owner" ? open : open.filter((s) => memberOf.has(s.id));
  const archivedStores = role === "owner" ? allStores.filter((s) => s.archived) : [];
  const multiStore = stores.length >= 2;

  // The saved choice if it's still allowed; otherwise "Todas las tiendas"
  // with 2+ Tiendas, or the only one.
  const saved = (await cookies()).get(STORE_COOKIE)?.value;
  const savedStore = [...stores, ...archivedStores].find((s) => s.id === saved) ?? null;
  const selectedStore = savedStore ?? (multiStore ? null : (stores[0] ?? null));
  const selected: StoreSelection = selectedStore?.id ?? "all";

  return {
    id: business.id,
    name: business.name,
    plan: business.plan,
    role,
    userId: user.id,
    allStores,
    stores,
    archivedStores,
    multiStore,
    selected,
    selectedStore,
    scopeStoreIds: selectedStore ? [selectedStore.id] : stores.map((s) => s.id),
  };
});
