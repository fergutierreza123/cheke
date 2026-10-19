import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getTemplates } from "@/lib/templates";
import { createClient } from "@/lib/supabase/server";
import type { TemplateSuggestion } from "@/lib/types";
import { TemplatesView, type WhatsAppPlantillas } from "./TemplatesView";
import type { TemplateApproval } from "./whatsappActions";

export default async function TemplatesPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  const [templates, { data: suggestions }, { data: channels }, approvals] = await Promise.all([
    getTemplates(business.id),
    // Sugerencias de chekelin: only Dueños and Gerentes review them (RLS too).
    business.role === "agent"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("template_suggestions")
          .select("id, question, times, name, category, body, created_at")
          .eq("business_id", business.id)
          .eq("status", "pending")
          .order("times", { ascending: false })
          .limit(10),
    // WhatsApp numbers of the Tiendas on screen: "Enviar a aprobación de WhatsApp".
    supabase
      .from("channels")
      .select("id, store_id, display_phone, verified_name")
      .eq("type", "whatsapp")
      .eq("status", "connected")
      .in("store_id", business.scopeStoreIds),
    // Before migration 0033 runs the table doesn't exist: no WhatsApp status.
    supabase
      .from("whatsapp_templates")
      .select("id, channel_id, source_template_id, name, status, category, rejected_reason")
      .in("store_id", business.scopeStoreIds)
      .order("created_at")
      .then(({ data, error }) => (error ? null : ((data ?? []) as TemplateApproval[]))),
  ]);

  const storeName = (id: string) => business.allStores.find((s) => s.id === id)?.name;
  const whatsapp: WhatsAppPlantillas | null =
    approvals === null
      ? null
      : {
          channels: (channels ?? []).map((c) => ({
            id: c.id,
            label: [c.display_phone ?? c.verified_name ?? "WhatsApp", business.multiStore ? storeName(c.store_id) : null]
              .filter(Boolean)
              .join(" · "),
          })),
          approvals,
          canSubmit: business.role !== "agent",
        };

  return (
    <TemplatesView
      templates={templates}
      suggestions={(suggestions ?? []) as TemplateSuggestion[]}
      whatsapp={whatsapp}
    />
  );
}
