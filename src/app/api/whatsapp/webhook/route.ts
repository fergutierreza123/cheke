import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { samePhone, verifyWebhookSignature } from "@/lib/whatsapp";
import { runChekelinReply } from "@/lib/bot";
import { sendPushToBusiness } from "@/lib/push";
import { describeMessage, type WhatsAppMessage } from "@/lib/whatsappMessages";

// Meta calls this once, when you register the webhook URL in the Meta App
// Dashboard, to prove you control this endpoint.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Meta calls this for every inbound message and every delivery/read status
// update on messages we sent. Must verify the signature, respond fast, and
// never throw — a slow or erroring webhook gets retried and eventually
// disabled by Meta.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await handlePayload(payload);
  } catch (error) {
    // Log and still return 200 — Meta doesn't need to know we had a bug,
    // it just needs to stop retrying. We fix it from the logs, not retries.
    console.error("whatsapp webhook error", error);
  }

  return NextResponse.json({ ok: true });
}

async function handlePayload(payload: WhatsAppWebhookPayload) {
  const supabase = createAdminClient();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const { data: channel } = await supabase
        .from("channels")
        .select("id, business_id")
        .eq("type", "whatsapp")
        .eq("external_id", phoneNumberId)
        .maybeSingle();

      // No business has connected this test number yet — nothing to save to.
      if (!channel) continue;

      for (const message of value.messages ?? []) {
        const saved = await saveInboundMessage(supabase, channel, value, message);
        // Best-effort: neither the phone alert nor Chekelin's reply may
        // block/break the webhook ack (each no-ops when not configured).
        if (saved) {
          await sendPushToBusiness(supabase, channel.business_id, {
            title: saved.contactName,
            body: saved.body ?? "Nuevo mensaje",
            conversationId: saved.conversationId,
          });
          await runChekelinReply(supabase, saved.conversationId).catch((error) =>
            console.error("chekelin reply error", error),
          );
        }
      }
      for (const status of value.statuses ?? []) {
        await updateMessageStatus(supabase, status);
      }
    }
  }
}

async function saveInboundMessage(
  supabase: ReturnType<typeof createAdminClient>,
  channel: { id: string; business_id: string },
  value: WhatsAppValue,
  message: WhatsAppMessage,
): Promise<{ conversationId: string; contactName: string; body: string | null } | null> {
  // Reactions (a 👍 on one of our messages) aren't conversation messages.
  const body = describeMessage(message);
  if (body === null) return null;

  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("external_message_id", message.id)
    .maybeSingle();
  if (existing) return null; // already saved — Meta redelivered it

  const waId = message.from;
  const profileName = value.contacts?.find((c) => c.wa_id === waId)?.profile?.name ?? waId;

  // The customer may already be in Contactos with their number typed any
  // way ("+504 9922-3843"), so compare digits rather than the raw string —
  // otherwise every such customer would get a second, duplicate contact.
  const { data: candidates } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("business_id", channel.business_id)
    .not("phone", "is", null)
    .limit(5000);
  let contact: { id: string } | null = candidates?.find((c) => samePhone(c.phone, waId)) ?? null;

  if (!contact) {
    const { data: newContact, error } = await supabase
      .from("contacts")
      .insert({ business_id: channel.business_id, name: profileName, phone: waId })
      .select("id")
      .single();
    if (error || !newContact) throw new Error(error?.message ?? "No se pudo crear el contacto.");
    contact = newContact;
  }

  // limit(1) instead of maybeSingle(): if a race ever created two rows,
  // maybeSingle() would error out and we'd create a third.
  const { data: existingConversations } = await supabase
    .from("conversations")
    .select("id")
    .eq("business_id", channel.business_id)
    .eq("contact_id", contact.id)
    .eq("channel_id", channel.id)
    .order("created_at", { ascending: true })
    .limit(1);
  let conversation = existingConversations?.[0] ?? null;

  const now = new Date();
  const windowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  if (!conversation) {
    const { data: newConversation, error } = await supabase
      .from("conversations")
      .insert({
        business_id: channel.business_id,
        contact_id: contact.id,
        channel_id: channel.id,
        status: "open",
        last_message_at: now.toISOString(),
        window_expires_at: windowExpiresAt,
      })
      .select("id")
      .single();
    if (error || !newConversation) throw new Error(error?.message ?? "No se pudo crear la conversación.");
    conversation = newConversation;
  } else {
    await supabase
      .from("conversations")
      // A customer writing again reopens a conversation that had been closed.
      .update({ last_message_at: now.toISOString(), window_expires_at: windowExpiresAt, status: "open" })
      .eq("id", conversation.id);
  }

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    business_id: channel.business_id,
    direction: "in",
    body,
    external_message_id: message.id,
    status: "sent",
    created_at: messageTime(message.timestamp, now),
  });

  return { conversationId: conversation.id, contactName: profileName, body };
}

// Meta can deliver "delivered" before "sent" (or retry an old one), so a
// status only ever moves forward — a late "sent" must not undo a "read".
const STATUS_RANK = { sent: 1, delivered: 2, read: 3, failed: 4 } as const;

async function updateMessageStatus(supabase: ReturnType<typeof createAdminClient>, status: WhatsAppStatus) {
  const next = STATUS_RANK[status.status as keyof typeof STATUS_RANK];
  if (!next) return;

  const { data: current } = await supabase
    .from("messages")
    .select("status")
    .eq("external_message_id", status.id)
    .maybeSingle();
  if (!current) return;

  const currentRank = STATUS_RANK[current.status as keyof typeof STATUS_RANK] ?? 0;
  // "failed" always wins (nothing was delivered); otherwise only move forward.
  if (status.status !== "failed" && (currentRank >= next || current.status === "failed")) return;

  await supabase.from("messages").update({ status: status.status }).eq("external_message_id", status.id);
}

function messageTime(timestamp: string | undefined, fallback: Date): string {
  const ms = Number(timestamp) * 1000;
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : fallback.toISOString();
}

// Minimal shape of what we actually read from Meta's payload — not exhaustive.
type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{ value: WhatsAppValue }>;
  }>;
};
type WhatsAppValue = {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
};
type WhatsAppStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
};
