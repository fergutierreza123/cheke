import { redirect } from "next/navigation";
import { canAccessStore, canManageStore, getCurrentBusiness, storeNamesForTags } from "@/lib/business";
import { getConversations, getMessages } from "@/lib/conversations";
import { getBusinessTags } from "@/lib/contacts";
import { getProducts } from "@/lib/products";
import { getTemplates } from "@/lib/templates";
import { getQuickReplies } from "@/lib/quickRepliesServer";
import { getTeamMembers } from "@/lib/team";
import { canUseChekelin } from "@/lib/plan";
import { displayNameOf } from "@/lib/chekelinState";
import { createClient } from "@/lib/supabase/server";
import { getStoreLocations } from "@/lib/storeLocationServer";
import { ChatView, type ChatPerson, type ChekelinStore } from "./ChatView";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; reasignar?: string; confirmar?: string }>;
}) {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");
  const { c, reasignar, confirmar } = await searchParams;

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

  const supabase = await createClient();
  const [conversations, products, templates, quickReplies, members, { data: storeRows }, { data: membership }, tagSuggestions] = await Promise.all([
    getConversations(business.id, storeIds),
    getProducts(business.id, storeIds),
    getTemplates(business.id),
    // Before migration 0024 runs, the table doesn't exist: no / list.
    getQuickReplies(business.id).catch(() => []),
    getTeamMembers(business.id).catch(() => []),
    supabase.from("stores").select("id, name, chekelin_off_until").in("id", storeIds),
    supabase.from("store_members").select("store_id, user_id").eq("business_id", business.id),
    getBusinessTags(business.id),
  ]);

  // Asignación: who can have a chat of each Tienda (its people + Dueños).
  const people: ChatPerson[] = members.map((m) => ({
    userId: m.user_id,
    name: displayNameOf(m),
    role: m.role,
    away: Boolean(m.away),
    storeIds:
      m.role === "owner" ? storeIds : (membership ?? []).filter((r) => r.user_id === m.user_id).map((r) => r.store_id),
  }));
  const chekelinStores: ChekelinStore[] = (storeRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    offUntil: s.chekelin_off_until ?? null,
    canManage: canManageStore(business, s.id),
  }));
  // "Ubicación" in the "+" sheet: each Tienda's saved location (0034).
  const { locations } = await getStoreLocations(supabase, storeIds);
  const storeLocations = Object.fromEntries(
    (storeRows ?? []).filter((s) => locations[s.id]).map((s) => [s.id, { name: s.name, location: locations[s.id] }]),
  );
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
      currentUserId={business.userId}
      people={people}
      chekelinAvailable={canUseChekelin(business.plan)}
      chekelinStores={chekelinStores}
      // The 10-minute alert's "toca para reasignar".
      highlightAssignment={requested !== null && reasignar === "1"}
      // The "comprobante recibido" alert: "Confirmar pago" is right there.
      highlightOrderId={requested !== null ? (confirmar ?? null) : null}
      quickReplies={quickReplies}
      canManageQuickReplies={business.role !== "agent"}
      storeLocations={storeLocations}
      tagSuggestions={tagSuggestions}
    />
  );
}
