import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getTemplates } from "@/lib/templates";
import { createClient } from "@/lib/supabase/server";
import type { TemplateSuggestion } from "@/lib/types";
import { TemplatesView } from "./TemplatesView";

export default async function TemplatesPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  const [templates, { data: suggestions }] = await Promise.all([
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
  ]);

  return <TemplatesView templates={templates} suggestions={(suggestions ?? []) as TemplateSuggestion[]} />;
}
