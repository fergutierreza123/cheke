import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getQuickReplies } from "@/lib/quickRepliesServer";
import { QuickRepliesView } from "./QuickRepliesView";

export const metadata = { title: "Respuestas rápidas · cheke" };

// Respuestas rápidas (issue #52): everyone sees and uses them (type / in
// Chat); Dueños and Gerentes create, edit and delete them.
export default async function QuickRepliesPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");
  const replies = await getQuickReplies(business.id).catch(() => []);
  return <QuickRepliesView replies={replies} canEdit={business.role !== "agent"} />;
}
