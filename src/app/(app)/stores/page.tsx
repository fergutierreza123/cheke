import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { StoresView } from "./StoresView";

export const metadata = { title: "Tiendas · cheke" };

// Administrar tiendas (Dueños): create, rename, archive and reopen Tiendas.
// Reached from Mi cuenta, or from the store selector once there are 2+.
export default async function StoresPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");
  if (business.role !== "owner") redirect("/chekeo");

  return <StoresView businessName={business.name} stores={business.stores} archivedStores={business.archivedStores} />;
}
