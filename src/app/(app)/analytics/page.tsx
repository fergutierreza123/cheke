import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getConversations } from "@/lib/conversations";
import { getProducts } from "@/lib/products";
import { AnalyticsView } from "./AnalyticsView";

export default async function AnalyticsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const [conversations, products] = await Promise.all([
    getConversations(business.id),
    getProducts(business.id),
  ]);

  return <AnalyticsView conversations={conversations} products={products} />;
}
