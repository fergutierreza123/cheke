import type { SupabaseClient } from "@supabase/supabase-js";
import { GRAPH_API_VERSION } from "@/lib/meta";
import { isMetaAuthError } from "@/lib/metaTokens";
import { credentialsForChannel, graphWithFallback, RECONNECT_MESSAGE, type WhatsAppCredentials } from "@/lib/whatsapp";
import {
  META_TEMPLATE_FIELDS,
  parseMetaTemplates,
  type CreateTemplateRequest,
  type MetaTemplateRow,
  type TemplateMessage,
} from "@/lib/whatsappTemplates";

// Server-only. Reads, creates and sends WhatsApp message templates through the
// Graph API, with the same tokens as every other WhatsApp call
// (credentialsForChannel: cheke's system-user token first, then the
// channel's own). Templates live on the WhatsApp Business Account (waba_id),
// and need the whatsapp_business_management permission.
// Table: whatsapp_templates (migration 0033). Pure helpers: whatsappTemplates.ts.

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
// A business rarely has more than a few dozen; 5 pages of 100 is plenty.
const MAX_PAGES = 5;

export const TEMPLATE_CHANNEL_COLUMNS = "id, business_id, store_id, type, status, external_id, waba_id, access_token_encrypted";

export type TemplateChannel = {
  id: string;
  business_id: string;
  store_id: string;
  type: string;
  status?: string | null;
  external_id: string | null;
  waba_id: string | null;
  access_token_encrypted: string | null;
};

type GraphError = {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
  error_data?: { details?: string };
};

function graphErrorText(error: GraphError | undefined, fallback: string): string {
  if (isMetaAuthError(error)) return RECONNECT_MESSAGE;
  return error?.error_user_msg || error?.message || fallback;
}

function credentialsFor(channel: TemplateChannel): WhatsAppCredentials | null {
  if (channel.type !== "whatsapp" || !channel.waba_id) return null;
  return credentialsForChannel(channel);
}

// Every template of the channel's WhatsApp Business Account, following
// Meta's pages. Errors come back as plain Spanish.
export async function fetchWabaTemplates(channel: TemplateChannel): Promise<{ rows?: MetaTemplateRow[]; error?: string }> {
  const credentials = credentialsFor(channel);
  if (!credentials) return { error: "Este número de WhatsApp no está conectado." };
  const rows: MetaTemplateRow[] = [];
  let url: string | null =
    `${GRAPH}/${channel.waba_id}/message_templates?fields=${META_TEMPLATE_FIELDS}&limit=100`;
  try {
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const pageUrl: string = url;
      const res = await graphWithFallback(credentials, (token) =>
        fetch(pageUrl, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }),
      );
      if (!res.ok) return { error: graphErrorText(res.data?.error, "WhatsApp no devolvió tus plantillas.") };
      rows.push(...parseMetaTemplates(res.data));
      const next: unknown = res.data?.paging?.next;
      url = typeof next === "string" && next.startsWith(GRAPH) ? next : null;
    }
  } catch {
    return { error: "No se pudo contactar a WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
  return { rows };
}

// Refreshes one channel's templates: saves what Meta has, removes what Meta
// no longer has. Service-role client; the caller already checked access.
export async function syncChannelTemplates(
  admin: SupabaseClient,
  channel: TemplateChannel,
): Promise<{ count?: number; error?: string }> {
  const fetched = await fetchWabaTemplates(channel);
  if (!fetched.rows) return { error: fetched.error };
  const now = new Date().toISOString();
  const rows = fetched.rows.map((r) => ({
    business_id: channel.business_id,
    store_id: channel.store_id,
    channel_id: channel.id,
    waba_id: channel.waba_id!,
    ...r,
    meta_template_id: r.meta_template_id || null,
    synced_at: now,
  }));
  if (rows.length) {
    const { error } = await admin.from("whatsapp_templates").upsert(rows, { onConflict: "channel_id,name,language" });
    if (error) {
      console.error("whatsapp templates: save failed", error.message);
      return { error: "No se pudieron guardar las plantillas. Inténtalo de nuevo." };
    }
  }
  // Rows not touched by this sync were deleted in Meta.
  const { error: cleanupError } = await admin
    .from("whatsapp_templates")
    .delete()
    .eq("channel_id", channel.id)
    .lt("synced_at", now);
  if (cleanupError) console.error("whatsapp templates: cleanup failed", cleanupError.message);
  return { count: rows.length };
}

// Every connected WhatsApp number in these Tiendas (or in all Tiendas for the
// daily cron, storeIds = null). Best effort per channel.
export async function syncWhatsAppTemplates(
  admin: SupabaseClient,
  storeIds: string[] | null,
): Promise<{ channels: number; templates: number; errors: string[] }> {
  let query = admin
    .from("channels")
    .select(TEMPLATE_CHANNEL_COLUMNS)
    .eq("type", "whatsapp")
    .eq("status", "connected")
    .not("waba_id", "is", null);
  if (storeIds) query = query.in("store_id", storeIds);
  const { data } = await query;
  const result = { channels: 0, templates: 0, errors: [] as string[] };
  for (const channel of (data ?? []) as TemplateChannel[]) {
    const r = await syncChannelTemplates(admin, channel);
    result.channels++;
    if (r.error) result.errors.push(r.error);
    else result.templates += r.count ?? 0;
  }
  return result;
}

// "Enviar a aprobación de WhatsApp": creates the template in the channel's
// WhatsApp Business Account. Meta answers with its id and first status
// (usually PENDING; some are approved within minutes).
export async function createWabaTemplate(
  channel: TemplateChannel,
  request: CreateTemplateRequest,
): Promise<{ id?: string; status?: string; category?: string; error?: string }> {
  const credentials = credentialsFor(channel);
  if (!credentials) return { error: "Este número de WhatsApp no está conectado." };
  try {
    const res = await graphWithFallback(credentials, (token) =>
      fetch(`${GRAPH}/${channel.waba_id}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(15_000),
      }),
    );
    if (!res.ok) {
      const error = res.data?.error as GraphError | undefined;
      // 2388024: a template with that name and language already exists.
      if (error?.error_subcode === 2388024 || /already exists|ya existe/i.test(`${error?.error_user_msg} ${error?.message}`)) {
        return { error: "Ya existe una plantilla de WhatsApp con ese nombre. Cambia el nombre e inténtalo de nuevo." };
      }
      return { error: graphErrorText(error, "WhatsApp no aceptó la plantilla.") };
    }
    return { id: res.data?.id, status: res.data?.status ?? "PENDING", category: res.data?.category ?? request.category };
  } catch {
    return { error: "No se pudo contactar a WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
}

// Sends a template message (POST /{phone_number_id}/messages). Same result
// shape as sendWhatsAppMessage, so failures are saved with Meta's code and
// explained by whatsappErrors.ts.
export async function sendTemplateMessage(
  credentials: WhatsAppCredentials | null,
  message: TemplateMessage,
): Promise<{ externalMessageId?: string; error?: string; errorCode?: number; errorDetails?: string; needsReconnect?: boolean }> {
  if (!credentials) return { error: "El canal de WhatsApp de este negocio no está conectado todavía." };
  let res: { ok: boolean; data: { error?: GraphError; messages?: Array<{ id?: string }> } | null };
  try {
    res = await graphWithFallback(credentials, (token) =>
      fetch(`${GRAPH}/${credentials.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(15_000),
      }),
    );
  } catch {
    return { error: "No se pudo contactar a WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
  if (!res.ok) {
    const error = res.data?.error;
    const needsReconnect = isMetaAuthError(error);
    return {
      error: needsReconnect ? RECONNECT_MESSAGE : (error?.message ?? "No se pudo enviar la plantilla."),
      errorCode: typeof error?.code === "number" ? error.code : undefined,
      errorDetails: [error?.message, error?.error_data?.details].filter(Boolean).join(" — ") || undefined,
      needsReconnect: needsReconnect || undefined,
    };
  }
  return { externalMessageId: res.data?.messages?.[0]?.id };
}
