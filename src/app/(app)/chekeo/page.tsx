import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getConversations } from "@/lib/conversations";
import { ChekeoView } from "./ChekeoView";

export default async function ChekeoPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const conversations = await getConversations(business.id);

  return <ChekeoView conversations={conversations} />;
}
