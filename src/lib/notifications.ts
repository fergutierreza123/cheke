import { createClient } from "@/lib/supabase/server";
import { formatLempiras } from "@/lib/format";
import type { ConversationWithContact, Product } from "@/lib/types";

export type NotificationKind = "message" | "warning" | "success";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  time: string; // ISO — sorted newest first, formatted client-side
  link: string;
};

const STALE_MS = 24 * 60 * 60 * 1000;
const LOW_STOCK_THRESHOLD = 3;

// Built live from real data every time the page loads, instead of a
// persisted notifications table — there's no "mark as read" that survives
// a reload, but nothing here is fabricated either. A `notification_reads`
// table would be the natural next step if that persistence turns out to
// matter more than the simplicity.
export async function getNotifications(
  businessId: string,
  conversations: ConversationWithContact[],
  products: Product[],
): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const items: NotificationItem[] = [];

  const { data: recentInbound } = await supabase
    .from("messages")
    .select("id, body, created_at, conversation_id, conversations(contact:contacts(name))")
    .eq("business_id", businessId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(5);

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
    });
  }

  const staleLeads = conversations.filter(
    (c) =>
      c.stage !== "ganado" &&
      c.stage !== "perdido" &&
      c.last_message_at &&
      Date.now() - new Date(c.last_message_at).getTime() > STALE_MS,
  );
  if (staleLeads.length > 0) {
    items.push({
      id: "warning-stale",
      kind: "warning",
      title: `${staleLeads.length} contacto${staleLeads.length === 1 ? "" : "s"} requiere${staleLeads.length === 1 ? "" : "n"} seguimiento`,
      description: "Llevan más de un día sin respuesta en tu Chekeo — revísalos antes de que se enfríen.",
      time: new Date().toISOString(),
      link: "/chekeo",
    });
  }

  const lowStock = products.filter((p) => p.stock <= LOW_STOCK_THRESHOLD);
  if (lowStock.length > 0) {
    items.push({
      id: "warning-stock",
      kind: "warning",
      title: "Poco inventario",
      description: lowStock.map((p) => `"${p.name}"`).join(", ") + " están por agotarse.",
      time: new Date().toISOString(),
      link: "/inventory",
    });
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
    });
  }

  return items.sort((a, b) => b.time.localeCompare(a.time));
}
