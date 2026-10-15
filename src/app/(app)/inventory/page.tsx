import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { StorePicker } from "@/components/StorePicker";
import { getProducts } from "@/lib/products";
import { getConversations } from "@/lib/conversations";
import { InventoryView } from "./InventoryView";

export default async function InventoryPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  // Each Tienda has its own catalog, so "Todas las tiendas" asks which one.
  const store = business.selectedStore;
  if (!store) {
    return (
      <StorePicker
        title="Catálogo"
        message="Cada tienda tiene su propio catálogo. ¿Cuál quieres ver?"
        stores={business.stores}
      />
    );
  }

  const [products, conversations] = await Promise.all([
    getProducts(business.id, [store.id]),
    getConversations(business.id, [store.id]),
  ]);
  // "Copiar a otra tienda": the other open Tiendas this person works in.
  const otherStores = business.stores.filter((s) => s.id !== store.id);

  return <InventoryView products={products} conversations={conversations} otherStores={otherStores} />;
}
