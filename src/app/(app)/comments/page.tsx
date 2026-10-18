import { redirect } from "next/navigation";
import { getCurrentBusiness, storeNamesForTags } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { COMMENT_ROW_COLUMNS, type CommentRow } from "@/lib/comments";
import { CommentsView } from "./CommentsView";

export const metadata = { title: "Comentarios · cheke" };

// Comentarios (issue #43): comments under the Tienda's Instagram and Facebook
// posts, what chekelin answered, and replying in public or by private.
export default async function CommentsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  // Before migration 0027 runs the table doesn't exist: an empty list.
  const { data } = await supabase
    .from("post_comments")
    .select(COMMENT_ROW_COLUMNS)
    .eq("business_id", business.id)
    .in("store_id", business.scopeStoreIds)
    .order("commented_at", { ascending: false })
    .limit(200);

  return (
    <CommentsView
      comments={(data ?? []) as CommentRow[]}
      storeNames={storeNamesForTags(business)}
      businessName={business.selectedStore?.name ?? business.name}
    />
  );
}
