import { redirect } from "next/navigation";
import { canManageStore, getCurrentBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { tagsInUse } from "@/lib/tags";
import { templateProblem, type WhatsAppTemplate } from "@/lib/whatsappTemplates";
import { STUCK_REASON } from "@/lib/broadcastsServer";
import { BroadcastView, type BroadcastRow, type BroadcastTemplate } from "./BroadcastView";

// Plantillas → Difusión (migration 0042). Dueños and Gerentes only.
export default async function DifusionPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");
  if (business.role === "agent") redirect("/templates");

  const supabase = await createClient();
  const storeIds = business.scopeStoreIds.filter((id) => canManageStore(business, id));
  const [{ data: channels }, { data: templates }, { data: contacts }, { data: broadcasts }] = await Promise.all([
    supabase
      .from("channels")
      .select("id, store_id, display_phone, verified_name")
      .eq("type", "whatsapp")
      .eq("status", "connected")
      .in("store_id", storeIds),
    supabase
      .from("whatsapp_templates")
      .select("id, channel_id, name, language, status, category, components")
      .in("store_id", storeIds)
      .eq("status", "APPROVED")
      .order("name"),
    // shortcut: Etiquetas from the first 1,000 contacts only (Supabase's row
    // cap); page through them if a Negocio has more.
    supabase.from("contacts").select("tags").eq("business_id", business.id),
    // Before migration 0042 runs the table doesn't exist: no history.
    supabase
      .from("broadcasts")
      .select("id, template, tags, status, created_at")
      .in("store_id", storeIds)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Progress of each recent Difusión.
  const count = async (id: string, statuses: string[], stuck = false) => {
    let q = supabase
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", id)
      .in("status", statuses);
    if (stuck) q = q.eq("error_reason", STUCK_REASON);
    const { count: n } = await q;
    return n ?? 0;
  };
  const history: BroadcastRow[] = await Promise.all(
    (broadcasts ?? []).map(async (b) => {
      const [sent, failed, waiting, cancelled, interrupted] = await Promise.all([
        count(b.id, ["sent"]),
        count(b.id, ["failed", "skipped"]),
        count(b.id, ["pending", "sending"]),
        count(b.id, ["cancelled"]),
        count(b.id, ["failed"], true),
      ]);
      return {
        id: b.id,
        name: (b.template as { name?: string })?.name ?? "",
        tags: b.tags ?? [],
        status: b.status,
        created_at: b.created_at,
        sent,
        failed: failed - interrupted,
        waiting,
        cancelled,
        interrupted,
      };
    }),
  );

  const storeName = (id: string) => business.allStores.find((s) => s.id === id)?.name;
  return (
    <BroadcastView
      businessName={business.name}
      channels={(channels ?? []).map((c) => ({
        id: c.id,
        label: [c.display_phone ?? c.verified_name ?? "WhatsApp", business.multiStore ? storeName(c.store_id) : null]
          .filter(Boolean)
          .join(" · "),
      }))}
      templates={((templates ?? []) as Array<BroadcastTemplate>).filter((t) => !templateProblem(t as WhatsAppTemplate))}
      tags={tagsInUse((contacts ?? []) as Array<{ tags: string[] | null }>)}
      history={history}
    />
  );
}
