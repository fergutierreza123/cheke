import { redirect } from "next/navigation";
import { canManageStore, getCurrentBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_CHEKELIN_INFO, type ChekelinInfo } from "@/lib/types";
import { getStoreLocations } from "@/lib/storeLocationServer";
import { EMPTY_STORE_LOCATION } from "@/lib/storeLocation";
import { ChekelinInfoView } from "./ChekelinInfoView";

export const metadata = { title: "Lo que chekelin sabe · cheke" };

// "Lo que chekelin sabe de tu negocio" (issue #40): short answers per Tienda
// that chekelin uses to sell, together with the Catálogo and the Plantillas.
// Dueños and the Tienda's Gerentes edit; Agentes can read it.
export default async function ChekelinInfoPage({ searchParams }: { searchParams: Promise<{ tienda?: string }> }) {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");
  if (business.stores.length === 0) redirect("/chat");

  const { tienda } = await searchParams;
  const store =
    business.stores.find((s) => s.id === tienda) ??
    business.stores.find((s) => s.id === business.selectedStore?.id) ??
    business.stores[0];

  const supabase = await createClient();
  const { data } = await supabase
    .from("store_chekelin_info")
    .select("payment_methods, shipping, delivery_hours, returns_policy, faq, address_form, business_kind, opening_hours")
    .eq("store_id", store.id)
    .maybeSingle();
  const info: ChekelinInfo = { ...EMPTY_CHEKELIN_INFO, business_kind: "products", opening_hours: null, ...(data ?? {}) } as ChekelinInfo;
  // The Tienda's location (Chat's "Ubicación"); hidden until migration 0034.
  const { available: locationAvailable, locations } = await getStoreLocations(supabase, [store.id]);

  return (
    <ChekelinInfoView
      // A fresh form when switching Tiendas.
      key={store.id}
      store={store}
      // Tabs only when the person works in 2+ Tiendas.
      stores={business.stores.length >= 2 ? business.stores : []}
      info={info}
      location={locationAvailable ? (locations[store.id] ?? EMPTY_STORE_LOCATION) : null}
      canEdit={canManageStore(business, store.id)}
    />
  );
}
