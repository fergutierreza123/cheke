import { createClient } from "@/lib/supabase/server";
import { formatLempiras } from "@/lib/format";
import type { ConversationWithContact } from "@/lib/types";

export type NotificationKind = "message" | "warning" | "success";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  time: string; // ISO — sorted newest first, formatted client-side
  link: string;
  // The Tienda it's about, for the store tag and filter in "Todas las tiendas".
  storeId?: string;
};

const STALE_MS = 24 * 60 * 60 * 1000;

// Built live from real data every time the page loads, instead of a
// persisted notifications table — there's no "mark as read" that survives
// a reload, but nothing here is fabricated either. A `notification_reads`
// table would be the natural next step if that persistence turns out to
// matter more than the simplicity.
//
// `storeIds` are the Tiendas on screen. With more than one, the follow-up
// warnings come one per Tienda so each carries its tag.
export async function getNotifications(
  businessId: string,
  storeIds: string[],
  conversations: ConversationWithContact[],
): Promise<NotificationItem[]> {
  if (storeIds.length === 0) return [];
  const supabase = await createClient();
  const items: NotificationItem[] = [];

  const { data: recentInbound } = await supabase
    .from("messages")
    .select("id, body, created_at, conversation_id, store_id, conversations(contact:contacts(name))")
    .eq("business_id", businessId)
    .in("store_id", storeIds)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(storeIds.length > 1 ? 10 : 5);

  for (const m of recentInbound ?? []) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations;
    const contact = conv ? (Array.isArray(conv.contact) ? conv.contact[0] : conv.contact) : null;
    items.push({
      id: `message-${m.id}`,
      kind: "message",
      title: `Nuevo mensaje de ${contact?.name ?? "un contacto"}`,
      description: m.body ?? "",
      time: m.created_at,
      link: `/chat?c=${m.conversation_id}`,
      storeId: m.store_id,
    });
  }

  for (const storeId of storeIds) {
    const several = storeIds.length > 1;
    pushWarnings(
      items,
      several ? conversations.filter((c) => c.store_id === storeId) : conversations,
      storeId,
    );
  }

  const recentWins = [...conversations]
    .filter((c) => c.stage === "ganado")
    .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))
    .slice(0, 5);
  for (const c of recentWins) {
    items.push({
      id: `success-${c.id}`,
      kind: "success",
      title: `Venta cerrada — ${c.contact.name}`,
      description: c.value_hnl ? formatLempiras(c.value_hnl) : "Sin valor asignado",
      time: c.last_message_at ?? c.created_at,
      link: `/chat?c=${c.id}`,
      storeId: c.store_id,
    });
  }

  return items.sort((a, b) => b.time.localeCompare(a.time));
}

function pushWarnings(
  items: NotificationItem[],
  conversations: ConversationWithContact[],
  storeId: string,
) {
  const staleLeads = conversations.filter(
    (c) =>
      c.stage !== "ganado" &&
      c.stage !== "perdido" &&
      c.last_message_at &&
      Date.now() - new Date(c.last_message_at).getTime() > STALE_MS,
  );
  if (staleLeads.length > 0) {
    items.push({
      id: `warning-stale-${storeId}`,
      kind: "warning",
      title: `${staleLeads.length} contacto${staleLeads.length === 1 ? "" : "s"} requiere${staleLeads.length === 1 ? "" : "n"} seguimiento`,
      description: "Llevan más de un día sin respuesta en tu Chekeo — revísalos antes de que se enfríen.",
      time: new Date().toISOString(),
      link: "/chekeo",
      storeId,
    });
  }

  // Customers waiting 10+ minutes for a person (same moment as the phone
  // alert to the Gerente / Dueño), with the one-tap reassign.
  const waitingSince = Date.now() - 10 * 60 * 1000;
  for (const c of conversations) {
    if (!c.awaiting_since || new Date(c.awaiting_since).getTime() > waitingSince) continue;
    if (Date.now() - new Date(c.awaiting_since).getTime() > STALE_MS) continue;
    items.push({
      id: `warning-waiting-${c.id}`,
      kind: "warning",
      title: `${c.contact.name} espera respuesta`,
      description: "Nadie le ha respondido en más de 10 minutos. Tócalo para responder o reasignar.",
      time: c.awaiting_since,
      link: `/chat?c=${c.id}&reasignar=1`,
      storeId,
    });
  }

}
