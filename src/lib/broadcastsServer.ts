import type { SupabaseClient } from "@supabase/supabase-js";
import { GRAPH_API_VERSION } from "@/lib/meta";
import { credentialsForChannel, graphWithFallback, type WhatsAppCredentials } from "@/lib/whatsapp";
import { markMessageFailed } from "@/lib/whatsappErrors";
import { markChannelNeedsReconnect } from "@/lib/channelHealth";
import { findOrCreateConversation } from "@/lib/messageRows";
import { buildTemplateMessage, renderTemplate, type WhatsAppTemplate } from "@/lib/whatsappTemplates";
import { sendTemplateMessage, TEMPLATE_CHANNEL_COLUMNS, type TemplateChannel } from "@/lib/whatsappTemplatesServer";
import {
  afterFailure,
  batchSize,
  DEFAULT_DAILY_LIMIT,
  parseMessagingLimit,
  recipientValues,
} from "@/lib/broadcasts";

// Server-only side of Difusión (migration 0042): the daily limit, the
// sending done by /api/cron/broadcasts, and opt-outs from the webhook.
// Pure helpers: broadcasts.ts.

const DAY_MS = 24 * 60 * 60 * 1000;

// The portfolio's customers-per-24 h limit from Meta, or 250 when it can't
// be read (docs/research/difusion-whatsapp.md §2).
export async function fetchDailyLimit(channel: TemplateChannel): Promise<number> {
  const credentials = credentialsForChannel(channel);
  if (!credentials) return DEFAULT_DAILY_LIMIT;
  try {
    const res = await graphWithFallback(credentials, (token) =>
      fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${credentials.phoneNumberId}?fields=whatsapp_business_manager_messaging_limit`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
      ),
    );
    return (res.ok && parseMessagingLimit(res.data?.whatsapp_business_manager_messaging_limit)) || DEFAULT_DAILY_LIMIT;
  } catch {
    return DEFAULT_DAILY_LIMIT;
  }
}

// Difusión messages the Negocio sent in the last 24 h.
// shortcut: ignores templates sent one by one from Chat; count those too if
// businesses start hitting Meta's limit before cheke's.
export async function sentLast24h(supabase: SupabaseClient, businessId: string): Promise<number> {
  const { count } = await supabase
    .from("broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("sent_at", new Date(Date.now() - DAY_MS).toISOString());
  return count ?? 0;
}

export async function setMarketingOptOut(admin: SupabaseClient, contactId: string, optOut: boolean): Promise<void> {
  const { error } = await admin.from("contacts").update({ marketing_opt_out: optOut }).eq("id", contactId);
  if (error) console.error("difusión: opt-out not saved", error.message);
}

// A template we sent failed later (status webhook). 131050 opts the
// customer out; for a Difusión, 131049 schedules the one retry after 24 h.
export async function handleTemplateFailure(
  admin: SupabaseClient,
  externalMessageId: string,
  code: number | null | undefined,
): Promise<void> {
  if (code !== 131049 && code !== 131050) return;
  const { data: recipient } = await admin
    .from("broadcast_recipients")
    .select("id, broadcast_id, contact_id, attempts")
    .eq("external_message_id", externalMessageId)
    .maybeSingle();
  if (recipient) {
    const next = afterFailure(code, recipient.attempts, Date.now());
    await admin
      .from("broadcast_recipients")
      .update({ status: next.status, error_code: code, sent_at: null, ...(next.nextAttemptAt ? { next_attempt_at: next.nextAttemptAt } : {}) })
      .eq("id", recipient.id);
    if (next.status === "pending") {
      await admin.from("broadcasts").update({ status: "sending", finished_at: null }).eq("id", recipient.broadcast_id);
    }
  }
  if (code === 131050) {
    let contactId = recipient?.contact_id as string | undefined;
    if (!contactId) {
      const { data } = await admin
        .from("messages")
        .select("conversation:conversations(contact_id)")
        .eq("external_message_id", externalMessageId)
        .maybeSingle();
      const conversation = Array.isArray(data?.conversation) ? data.conversation[0] : data?.conversation;
      contactId = (conversation as { contact_id?: string } | undefined)?.contact_id;
    }
    if (contactId) await setMarketingOptOut(admin, contactId, true);
  }
}

type Broadcast = {
  id: string;
  business_id: string;
  template: Pick<WhatsAppTemplate, "name" | "language" | "category" | "components">;
  template_values: Record<string, string>;
  name_variable: string | null;
  channel: TemplateChannel | TemplateChannel[] | null;
};
type Recipient = { id: string; attempts: number; contact_id: string };
type Contact = { id: string; name: string | null; phone: string | null; marketing_opt_out: boolean };

// One customer: saved in Chat (a new conversation if needed, like any
// template) and sent. The message counts as automated (is_bot), so the chat
// isn't handed to a person and chekelin answers the customer's reply.
// "stop" = the number lost its connection: stop this Difusión for now.
async function sendOne(
  admin: SupabaseClient,
  b: Broadcast,
  channel: TemplateChannel,
  credentials: WhatsAppCredentials | null,
  demo: boolean,
  r: Recipient,
  contact: Contact | undefined,
): Promise<"sent" | "failed" | "skipped" | "stop"> {
  const attempts = r.attempts + 1;
  const done = (fields: Record<string, unknown>) =>
    admin.from("broadcast_recipients").update({ attempts, ...fields }).eq("id", r.id);
  if (!contact?.phone || contact.marketing_opt_out) {
    await done({ status: "skipped" });
    return "skipped";
  }
  const values = recipientValues(b.template_values, b.name_variable, contact.name);
  const conversation = await findOrCreateConversation(admin, channel, contact.id);
  const { data: message, error } = await admin
    .from("messages")
    .insert({ conversation_id: conversation.id, business_id: b.business_id, direction: "out", is_bot: true, body: renderTemplate(b.template, values) })
    .select("id, created_at")
    .single();
  if (error || !message) {
    console.error("difusión: message not saved", error?.message);
    await done({ status: "failed" });
    return "failed";
  }
  await admin.from("conversations").update({ last_message_at: message.created_at }).eq("id", conversation.id);

  const now = new Date().toISOString();
  // The app reviewers' demo Negocio (modo prueba) saves without sending.
  if (demo) {
    await done({ status: "sent", sent_at: now, message_id: message.id });
    return "sent";
  }
  const result = await sendTemplateMessage(credentials, buildTemplateMessage(contact.phone, b.template, values));
  if (result.needsReconnect) {
    await markChannelNeedsReconnect(channel.id, `whatsapp_${result.errorCode ?? "auth"}`);
    await markMessageFailed(admin, message.id, result);
    // Not this customer's fault: back in line for when the number is fixed.
    await admin.from("broadcast_recipients").update({ status: "pending" }).eq("id", r.id);
    return "stop";
  }
  if (result.error) {
    await markMessageFailed(admin, message.id, result);
    const next = afterFailure(result.errorCode, attempts, Date.now());
    await done({ status: next.status, error_code: result.errorCode ?? null, message_id: message.id, ...(next.nextAttemptAt ? { next_attempt_at: next.nextAttemptAt } : {}) });
    if (next.optOut) await setMarketingOptOut(admin, contact.id, true);
    return "failed";
  }
  if (result.externalMessageId) {
    await admin.from("messages").update({ external_message_id: result.externalMessageId }).eq("id", message.id);
  }
  await done({ status: "sent", sent_at: now, message_id: message.id, external_message_id: result.externalMessageId ?? null });
  return "sent";
}

// /api/cron/broadcasts: sends the next customers of every Difusión in
// progress, one at a time (far below Coexistence's 20 per second), never past
// the Negocio's 24 h limit. What's left goes out on later runs.
// shortcut: a run that dies mid-send leaves that one customer "sending"
// forever (never sent twice); add a sweeper if it ever shows up in progress.
export async function runBroadcasts(
  admin: SupabaseClient,
  { maxPerRun = 60, deadline = Date.now() + 50_000 } = {},
): Promise<{ sent: number; failed: number }> {
  const totals = { sent: 0, failed: 0 };
  const { data: broadcasts } = await admin
    .from("broadcasts")
    .select(`id, business_id, template, template_values, name_variable, channel:channels(${TEMPLATE_CHANNEL_COLUMNS})`)
    .eq("status", "sending")
    .order("created_at")
    .limit(10);
  const room = new Map<string, number>(); // what each Negocio may still send today

  for (const b of (broadcasts ?? []) as Broadcast[]) {
    const channel = Array.isArray(b.channel) ? b.channel[0] : b.channel;
    if (!channel || channel.status !== "connected") continue;
    if (!room.has(b.business_id)) {
      const [limit, used] = await Promise.all([fetchDailyLimit(channel), sentLast24h(admin, b.business_id)]);
      room.set(b.business_id, batchSize(limit, used, Number.MAX_SAFE_INTEGER));
    }
    const n = batchSize(room.get(b.business_id)!, 0, maxPerRun - totals.sent - totals.failed);

    if (n > 0) {
      const { data: due } = await admin
        .from("broadcast_recipients")
        .select("id, contact_id")
        .eq("broadcast_id", b.id)
        .eq("status", "pending")
        .lte("next_attempt_at", new Date().toISOString())
        .order("created_at")
        .limit(n);
      const { data: contacts } = due?.length
        ? await admin
            .from("contacts")
            .select("id, name, phone, marketing_opt_out")
            .in("id", due.map((r) => r.contact_id))
        : { data: [] };
      const byId = new Map(((contacts ?? []) as Contact[]).map((c) => [c.id, c]));
      const { data: business } = await admin.from("businesses").select("is_demo").eq("id", b.business_id).maybeSingle();
      const credentials = credentialsForChannel(channel);

      for (const d of due ?? []) {
        if (Date.now() > deadline) break; // the rest stay pending for the next run
        // Claimed one at a time, right before sending: two runs at once never
        // send twice, and a run killed mid-send strands only this customer.
        const { data: claimed } = await admin
          .from("broadcast_recipients")
          .update({ status: "sending" })
          .eq("id", d.id)
          .eq("status", "pending")
          .select("id, attempts, contact_id");
        const r = (claimed as Recipient[] | null)?.[0];
        if (!r) continue;
        let outcome: Awaited<ReturnType<typeof sendOne>>;
        try {
          outcome = await sendOne(admin, b, channel, credentials, business?.is_demo === true, r, byId.get(r.contact_id));
        } catch (error) {
          // Unknown whether Meta got it: failed, never retried (no double send).
          console.error("difusión: send error", error);
          await admin.from("broadcast_recipients").update({ status: "failed", attempts: r.attempts + 1 }).eq("id", r.id);
          outcome = "failed";
        }
        if (outcome === "stop") break;
        if (outcome === "sent") {
          totals.sent++;
          room.set(b.business_id, room.get(b.business_id)! - 1);
        } else totals.failed++;
      }
    }

    const { count: left } = await admin
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", b.id)
      .in("status", ["pending", "sending"]);
    if (left === 0) {
      await admin.from("broadcasts").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", b.id);
    }
  }
  return totals;
}
