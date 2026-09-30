import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getProducts } from "@/lib/products";
import { getConversations } from "@/lib/conversations";
import { InventoryView } from "./InventoryView";

export default async function InventoryPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const [products, conversations] = await Promise.all([
    getProducts(business.id),
    getConversations(business.id),
  ]);

  return <InventoryView products={products} conversations={conversations} />;
}
