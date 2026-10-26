"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ARCHIVED_STORE_READ_ONLY, canManageStore, canWriteToStore, getCurrentBusiness } from "@/lib/business";
import { templateProblem, templateVariables, validateTemplateValues, type WhatsAppTemplate } from "@/lib/whatsappTemplates";
import { TEMPLATE_CHANNEL_COLUMNS, type TemplateChannel } from "@/lib/whatsappTemplatesServer";
import { broadcastRecipients, estimateCost, isMarketing, type BroadcastContact } from "@/lib/broadcasts";
import { normalizeTags } from "@/lib/tags";
import { fetchDailyLimit, sentLast24h } from "@/lib/broadcastsServer";

// Plantillas → Difusión (migration 0042): the preview (how many, how much)
// and creating the Difusión. /api/cron/broadcasts does the sending.

type Input = { channelId: string; templateId: string; tags: string[] };

export type BroadcastPreview = {
  count: number;
  noPhone: number;
  optedOut: number;
  usNumbers: number;
  usd: number;
  hnl: number;
  marketing: boolean;
  // How many more customers can get one today (24 h limit minus what went out).
  roomToday: number;
};

// Everything both actions check, as the signed-in person (RLS).
async function prepare(input: Input) {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role === "agent") return { error: "Solo el dueño o un gerente puede enviar difusiones." };
  const tags = normalizeTags(input.tags);
  if (!tags.length) return { error: "Elige al menos una etiqueta." };

  const supabase = await createClient();
  const { data: channel } = await supabase.from("channels").select(TEMPLATE_CHANNEL_COLUMNS).eq("id", input.channelId).maybeSingle();
  if (!channel || channel.type !== "whatsapp" || channel.status !== "connected") {
    return { error: "Elige un número de WhatsApp conectado." };
  }
  if (!canManageStore(business, channel.store_id)) return { error: "Solo el dueño o el gerente de esa tienda puede hacerlo." };
  if (!canWriteToStore(business, channel.store_id)) return { error: ARCHIVED_STORE_READ_ONLY };

  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select("id, name, language, status, category, components")
    .eq("id", input.templateId)
    .eq("channel_id", channel.id)
    .maybeSingle();
  if (!template) return { error: "No se encontró la plantilla." };
  const problem = templateProblem(template as WhatsAppTemplate);
  if (problem) return { error: problem };

  // Supabase returns at most 1,000 rows per request: read in pages.
  const contacts: BroadcastContact[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, phone, tags, marketing_opt_out")
      .eq("business_id", business.id)
      .overlaps("tags", tags)
      .order("id")
      .range(from, from + 999);
    if (error) return { error: "La difusión todavía no está activada en cheke." };
    contacts.push(...(data as BroadcastContact[]));
    if (data.length < 1000) break;
  }
  const picked = broadcastRecipients(contacts, tags, template.category);
  return { business, supabase, channel: channel as TemplateChannel, template: template as WhatsAppTemplate, tags, picked };
}

export async function previewBroadcast(input: Input): Promise<{ preview?: BroadcastPreview; error?: string }> {
  const p = await prepare(input);
  if (!p.picked) return { error: p.error };
  const count = p.picked.recipients.length;
  const [limit, used] = await Promise.all([fetchDailyLimit(p.channel), sentLast24h(p.supabase, p.business.id)]);
  const cost = estimateCost(count, p.template.category);
  return {
    preview: {
      count,
      noPhone: p.picked.noPhone,
      optedOut: p.picked.optedOut,
      usNumbers: p.picked.usNumbers,
      ...cost,
      marketing: isMarketing(p.template.category),
      roomToday: Math.max(0, limit - used),
    },
  };
}

export async function createBroadcast(
  input: Input & { values: Record<string, string>; nameVariable: string | null; consent: boolean },
): Promise<{ count?: number; error?: string }> {
  const p = await prepare(input);
  if (!p.picked) return { error: p.error };
  const { template, channel } = p;
  if (isMarketing(template.category) && !input.consent) {
    return { error: "Confirma que tus clientes aceptaron recibir ofertas antes de enviar." };
  }
  const nameVariable = input.nameVariable && templateVariables(template).includes(input.nameVariable) ? input.nameVariable : null;
  const invalid = validateTemplateValues(template, input.values);
  if (invalid) return { error: nameVariable ? `${invalid} (para el nombre, escribe qué poner si no tenemos el nombre del cliente).` : invalid };
  const recipients = p.picked.recipients;
  if (!recipients.length) return { error: "Nadie con esas etiquetas puede recibir esta difusión." };

  const { data: broadcast, error } = await p.supabase
    .from("broadcasts")
    .insert({
      business_id: channel.business_id,
      store_id: channel.store_id,
      channel_id: channel.id,
      template: { name: template.name, language: template.language, category: template.category, components: template.components },
      template_values: input.values,
      name_variable: nameVariable,
      tags: p.tags,
      created_by: p.business.userId,
    })
    .select("id")
    .single();
  if (error || !broadcast) {
    console.error("difusión: not created", error?.message);
    return { error: "No se pudo crear la difusión. Inténtalo de nuevo." };
  }
  // Recipients are written by the server only (no insert policy).
  const admin = createAdminClient();
  const rows = recipients.map((c) => ({ broadcast_id: broadcast.id, business_id: channel.business_id, contact_id: c.id }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: rowsError } = await admin.from("broadcast_recipients").insert(rows.slice(i, i + 500));
    if (rowsError) {
      console.error("difusión: recipients not saved", rowsError.message);
      await admin.from("broadcasts").delete().eq("id", broadcast.id);
      return { error: "No se pudo crear la difusión. Inténtalo de nuevo." };
    }
  }
  // Every recipient saved: now the cron may start (and finish) it.
  await admin.from("broadcasts").update({ status: "sending" }).eq("id", broadcast.id);
  revalidatePath("/templates/difusion");
  return { count: recipients.length };
}
