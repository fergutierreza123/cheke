import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getTemplates } from "@/lib/templates";
import { TemplatesView } from "./TemplatesView";

export default async function TemplatesPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const templates = await getTemplates(business.id);

  return <TemplatesView templates={templates} />;
}
