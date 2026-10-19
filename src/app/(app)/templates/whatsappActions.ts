"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageStore, canWriteToStore, getCurrentBusiness, ARCHIVED_STORE_READ_ONLY } from "@/lib/business";
import {
  buildCreateTemplateRequest,
  templateSlug,
  validateNewTemplate,
  NEW_TEMPLATE_LANGUAGE,
} from "@/lib/whatsappTemplates";
import {
  createWabaTemplate,
  syncWhatsAppTemplates,
  TEMPLATE_CHANNEL_COLUMNS,
  type TemplateChannel,
} from "@/lib/whatsappTemplatesServer";

// Plantillas → "Enviar a aprobación de WhatsApp": turns a saved reply into a
// WhatsApp message template, reviewed by Meta, so it can be sent from Chat
// after 24 h. Table: whatsapp_templates (migration 0033).

export type TemplateApproval = {
  id: string;
  channel_id: string;
  source_template_id: string | null;
  name: string;
  status: string;
  category: string;
  rejected_reason: string | null;
};

export async function submitTemplateForApproval(input: {
  sourceTemplateId: string;
  channelId: string;
  name: string;
  category: string;
  // Already in WhatsApp's {{1}} form.
  body: string;
  examples: string[];
}): Promise<{ approval?: TemplateApproval; error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role === "agent") return { error: "Solo el dueño o un gerente puede enviar plantillas a WhatsApp." };

  const name = templateSlug(input.name);
  const request = { name, category: input.category, body: input.body, examples: input.examples };
  const invalid = validateNewTemplate(request);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const [{ data: channel }, { data: source }] = await Promise.all([
    supabase.from("channels").select(TEMPLATE_CHANNEL_COLUMNS).eq("id", input.channelId).maybeSingle(),
    supabase.from("templates").select("id").eq("id", input.sourceTemplateId).eq("business_id", business.id).maybeSingle(),
  ]);
  if (!channel || channel.type !== "whatsapp" || channel.status !== "connected") {
    return { error: "Conecta WhatsApp en Canales antes de enviar plantillas a aprobación." };
  }
  if (!canManageStore(business, channel.store_id)) return { error: "Solo el dueño o el gerente de esa tienda puede hacerlo." };
  if (!canWriteToStore(business, channel.store_id)) return { error: ARCHIVED_STORE_READ_ONLY };
  if (!source) return { error: "No se encontró la plantilla." };

  const created = await createWabaTemplate(channel as TemplateChannel, buildCreateTemplateRequest(request));
  if (created.error) return { error: created.error };

  const { data: row, error } = await createAdminClient()
    .from("whatsapp_templates")
    .upsert(
      {
        business_id: channel.business_id,
        store_id: channel.store_id,
        channel_id: channel.id,
        waba_id: channel.waba_id,
        meta_template_id: created.id ?? null,
        name,
        language: NEW_TEMPLATE_LANGUAGE,
        status: created.status ?? "PENDING",
        category: created.category ?? input.category,
        components: buildCreateTemplateRequest(request).components,
        rejected_reason: null,
        source_template_id: source.id,
        created_by: business.userId,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,name,language" },
    )
    .select("id, channel_id, source_template_id, name, status, category, rejected_reason")
    .single();
  // Meta has it already; the next "Actualizar" brings it in anyway.
  if (error || !row) {
    console.error("whatsapp templates: could not save the new template", error?.message);
    return { error: "WhatsApp recibió la plantilla, pero cheke no pudo guardarla. Toca «Actualizar» en un momento." };
  }
  revalidatePath("/templates");
  return { approval: row as TemplateApproval };
}

// "Actualizar estado": reads every WhatsApp number's templates again (review
// results arrive in minutes to a day).
export async function refreshTemplateApprovals(): Promise<{ approvals?: TemplateApproval[]; error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  const result = await syncWhatsAppTemplates(createAdminClient(), business.scopeStoreIds);
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("id, channel_id, source_template_id, name, status, category, rejected_reason")
    .in("store_id", business.scopeStoreIds);
  revalidatePath("/templates");
  return { approvals: (data ?? []) as TemplateApproval[], error: result.errors[0] };
}
