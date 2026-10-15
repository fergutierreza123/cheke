import { redirect } from "next/navigation";
import { canAccessStore, getCurrentBusiness, storeNamesForTags } from "@/lib/business";
import { getConversations, getMessages } from "@/lib/conversations";
import { getProducts } from "@/lib/products";
import { getTemplates } from "@/lib/templates";
import { createClient } from "@/lib/supabase/server";
import { ChatView } from "./ChatView";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");
  const { c } = await searchParams;

  // A tapped phone notification can be for a Tienda other than the one
  // selected: show that Tienda's chats too (with store tags), so the
  // conversation still opens.
  let storeIds = business.scopeStoreIds;
  let storeNames = storeNamesForTags(business);
  if (c) {
    const supabase = await createClient();
    const { data: target } = await supabase.from("conversations").select("store_id").eq("id", c).maybeSingle();
    if (target && !storeIds.includes(target.store_id) && canAccessStore(business, target.store_id)) {
      storeIds = [...storeIds, target.store_id];
      storeNames = Object.fromEntries(
        business.allStores.filter((s) => storeIds.includes(s.id)).map((s) => [s.id, s.name]),
      );
    }
  }

  const [conversations, products, templates] = await Promise.all([
    getConversations(business.id, storeIds),
    getProducts(business.id, storeIds),
    getTemplates(business.id),
  ]);
  const requested = c && conversations.some((conv) => conv.id === c) ? c : null;
  const firstId = requested ?? conversations[0]?.id ?? null;
  const initialMessages = firstId ? await getMessages(firstId) : [];

  return (
    <ChatView
      // A tapped phone notification navigates here with a new ?c= while Chat
      // may already be open; a fresh key makes it open that conversation
      // instead of keeping the one on screen.
      key={requested ?? "inbox"}
      businessId={business.id}
      storeIds={storeIds}
      storeNames={storeNames}
      conversations={conversations}
      products={products}
      templates={templates}
      initialSelectedId={firstId}
      initialMessages={initialMessages}
      startInThread={requested !== null}
    />
  );
}
