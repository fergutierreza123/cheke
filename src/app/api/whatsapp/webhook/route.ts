import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { credentialsForChannel, samePhone, verifyWebhookSignature } from "@/lib/whatsapp";
import { handleInboundMessage } from "@/lib/bot";
import { describeMessage, whatsappMedia, type WhatsAppMessage } from "@/lib/whatsappMessages";
import { saveMessageMedia, type MediaJob } from "@/lib/messageMedia";
import { explainWhatsAppError } from "@/lib/whatsappErrors";
import { deletedFields, whatsappChange, whatsappReaction, whatsappReplyTo } from "@/lib/messageEvents";
import { findMessageId, insertMessage } from "@/lib/messageRows";
import { createMessageClock } from "@/lib/messageClock";
import { saveReferral, whatsappReferral } from "@/lib/adReferral";
import type { MediaInfo } from "@/lib/types";

// Meta resends if we answer slowly, so the push alert and Chekelin's AI reply
// (which can take several seconds) run *after* the response, with room to finish.
export const maxDuration = 60;

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

  let saved: SavedMessage[] = [];
  // Photos, voice notes, documents… to download once Meta has its answer.
  const media: MediaJob[] = [];
  try {
    saved = await handlePayload(payload, media);
  } catch (error) {
    // Log and still return 200 — Meta doesn't need to know we had a bug,
    // it just needs to stop retrying. We fix it from the logs, not retries.
    console.error("whatsapp webhook error", error);
  }

  // Best-effort and off the critical path: neither the phone alert nor
  // Chekelin's reply may delay or break the ack to Meta (each no-ops when not
  // configured).
  if (saved.length > 0) {
    after(async () => {
      const supabase = createAdminClient();
      // chekelin answers (after a natural 3–10 s pause with "escribiendo…")
      // or hands off; otherwise the chat goes to a person and only they are
      // alerted (src/lib/bot.ts). Once per conversation — chekelin reads the
      // whole conversation, so several messages in a row get one answer —
      // and conversations in parallel, to stay well inside maxDuration.
      await Promise.all(
        latestPerConversation(saved).map((item) =>
          handleInboundMessage(supabase, item.conversationId, { preview: item.body }).catch((error) =>
            console.error("inbound handling error", error),
          ),
        ),
      );
    });
  }

  if (media.length > 0) {
    after(() => saveMessageMedia(createAdminClient(), media));
  }

  return NextResponse.json({ ok: true });
}

type SavedMessage = {
  businessId: string;
  storeId: string;
  conversationId: string;
  contactName: string;
  body: string | null;
};

// The last saved message of each conversation, in arrival order.
function latestPerConversation(saved: SavedMessage[]): SavedMessage[] {
  const last = new Map<string, SavedMessage>();
  for (const item of saved) last.set(item.conversationId, item);
  return [...last.values()];
}

type Admin = ReturnType<typeof createAdminClient>;
type MessageClock = ReturnType<typeof createMessageClock>;
// A channel belongs to one Tienda: its conversations (and their messages)
// go to that Tienda. Contacts are matched across the whole Negocio.
// Its token downloads the media customers send.
type Channel = {
  id: string;
  business_id: string;
  store_id: string;
  external_id: string | null;
  access_token_encrypted: string | null;
};

// Each business's contacts, loaded once per webhook call: a history import
// can bring hundreds of chats in one payload, and each needs its contact.
type ContactBook = Map<string, Array<{ id: string; phone: string | null; name: string }>>;

async function handlePayload(payload: WhatsAppWebhookPayload, media: MediaJob[]): Promise<SavedMessage[]> {
  const supabase = createAdminClient();
  const book: ContactBook = new Map();
  const saved: SavedMessage[] = [];
  // Each message its own instant, in arrival order (src/lib/messageClock.ts).
  const clock = createMessageClock();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      // Account-level events carry the WhatsApp Business Account id, not a number.
      if (change.field === "account_update") {
        await handleAccountUpdate(supabase, entry.id, value);
        continue;
      }

      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const { data: channel } = await supabase
        .from("channels")
        .select("id, business_id, store_id, external_id, access_token_encrypted")
        .eq("type", "whatsapp")
        .eq("external_id", phoneNumberId)
        // A disconnected channel (archived Tienda, or removed from the
        // WhatsApp Business app) must not keep receiving customer messages.
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();

      // No business has connected this test number yet — nothing to save to.
      if (!channel) continue;

      // Coexistence: the one-time import of the phone's chat history...
      if (change.field === "history") {
        await saveHistory(supabase, book, channel, value, media);
        continue;
      }
      // ...and of the phone's contacts (plus later changes to them).
      if (change.field === "smb_app_state_sync") {
        await syncPhoneContacts(supabase, book, channel, value);
        continue;
      }

      // One bad message must not drop the rest of the batch.
      for (const message of value.messages ?? []) {
        try {
          // A reaction, edit or delete changes a message already saved.
          if (await applyMessageChange(supabase, channel, message, "in")) continue;
          const result = await saveInboundMessage(supabase, book, channel, value, message, media, clock);
          if (result) saved.push({ businessId: channel.business_id, storeId: channel.store_id, ...result });
        } catch (error) {
          console.error("whatsapp inbound message error", message?.id, error);
        }
      }
      // Coexistence: what the business sent from the WhatsApp Business app.
      for (const echo of value.message_echoes ?? []) {
        try {
          if (await applyMessageChange(supabase, channel, echo, "out")) continue;
          await saveEchoMessage(supabase, book, channel, echo, media, clock);
        } catch (error) {
          console.error("whatsapp echo error", echo?.id, error);
        }
      }
      for (const status of value.statuses ?? []) {
        try {
          await updateMessageStatus(supabase, status);
        } catch (error) {
          console.error("whatsapp status error", status?.id, error);
        }
      }
    }
  }
  return saved;
}

async function saveInboundMessage(
  supabase: Admin,
  book: ContactBook,
  channel: Channel,
  value: WhatsAppValue,
  message: WhatsAppMessage,
  media: MediaJob[],
  clock: MessageClock,
): Promise<{ conversationId: string; contactName: string; body: string | null } | null> {
  // Reactions, edits and deletes were applied before getting here.
  const body = describeMessage(message);
  if (body === null) return null;
  if (await alreadySaved(supabase, message.id)) return null; // Meta redelivered it

  const waId = message.from;
  const profileName = value.contacts?.find((c) => c.wa_id === waId)?.profile?.name ?? waId;
  const contactId = await findOrCreateContact(supabase, book, channel.business_id, waId, profileName);
  const conversation = await findOrCreateConversation(supabase, channel, contactId);

  const now = new Date();
  const windowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("conversations")
    // A customer writing again reopens a conversation that had been closed.
    .update({ last_message_at: now.toISOString(), window_expires_at: windowExpiresAt, status: "open" })
    .eq("id", conversation.id);

  const { error: insertError } = await insertMessage(supabase, {
    conversation_id: conversation.id,
    business_id: channel.business_id,
    direction: "in",
    body,
    external_message_id: message.id,
    status: "sent",
    created_at: clock(message.timestamp, now.getTime()),
    reply_to_id: await findMessageId(supabase, channel.business_id, whatsappReplyTo(message)),
  });
  if (insertError) {
    // 23505 = the same message arrived twice at once; the other copy won.
    if (insertError.code === "23505") return null;
    throw new Error(insertError.message);
  }
  queueMedia(media, channel, message);
  const referral = whatsappReferral(message);
  if (referral) await saveReferral(supabase, conversation.id, referral, now.toISOString());

  return { conversationId: conversation.id, contactName: profileName, body };
}

// A message the business sent from the WhatsApp Business app on its phone
// (coexistence). It shows in the chat like any reply and counts as a person
// replying: chekelin goes silent, the timers stop and an unassigned chat goes
// to the Dueño (database trigger, migration 0021). It doesn't touch the
// 24-hour window: only the customer's messages open it.
async function saveEchoMessage(
  supabase: Admin,
  book: ContactBook,
  channel: Channel,
  echo: WhatsAppEcho,
  media: MediaJob[],
  clock: MessageClock,
) {
  const body = describeMessage(echo);
  if (body === null || !echo.to) return;
  if (await alreadySaved(supabase, echo.id)) return;

  const contactId = await findOrCreateContact(supabase, book, channel.business_id, echo.to, echo.to);
  const conversation = await findOrCreateConversation(supabase, channel, contactId);
  const sentAt = clock(echo.timestamp, Date.now());

  const { error } = await insertMessage(supabase, {
    conversation_id: conversation.id,
    business_id: channel.business_id,
    direction: "out",
    body,
    external_message_id: echo.id,
    status: "sent",
    source: "phone",
    created_at: sentAt,
    reply_to_id: await findMessageId(supabase, channel.business_id, whatsappReplyTo(echo)),
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  queueMedia(media, channel, echo);

  await supabase
    .from("conversations")
    .update({ last_message_at: later(conversation.last_message_at, sentAt) })
    .eq("id", conversation.id);
}

// A reaction, an edit or a delete for everyone, from the customer ("in") or
// from the business's phone under Coexistence ("out"): applied to the stored
// message instead of saved as a new one. True when the message was one of
// these (even if the original isn't in cheke).
async function applyMessageChange(
  supabase: Admin,
  channel: Channel,
  message: WhatsAppMessage,
  side: "in" | "out",
): Promise<boolean> {
  const reaction = whatsappReaction(message);
  if (reaction) {
    // Either side can react to any message in the chat, theirs or ours.
    await supabase
      .from("messages")
      .update(side === "in" ? { reaction_in: reaction.emoji } : { reaction_out: reaction.emoji })
      .eq("business_id", channel.business_id)
      .eq("external_message_id", reaction.targetId);
    return true;
  }

  const change = whatsappChange(message);
  if (!change) return false;
  // Only the author can edit or delete: the customer their own messages,
  // the business its own.
  const { data: target } = await supabase
    .from("messages")
    .select("id, media_info")
    .eq("business_id", channel.business_id)
    .eq("external_message_id", change.targetId)
    .eq("direction", side)
    .maybeSingle<{ id: string; media_info: MediaInfo | null }>();
  if (!target) return true;
  const at = messageTime(message.timestamp, new Date());

  if (change.kind === "revoke") {
    await supabase.from("messages").update(deletedFields(at)).eq("id", target.id);
    return true;
  }

  const body = describeMessage(change.message);
  if (body === null) return true;
  const newCaption = whatsappMedia(change.message)?.info.caption;
  await supabase
    .from("messages")
    .update({
      body,
      edited_at: at,
      // A photo's caption was edited: the bubble shows the caption.
      ...(newCaption && target.media_info ? { media_info: { ...target.media_info, caption: newCaption } } : {}),
    })
    .eq("id", target.id);
  return true;
}

// Coexistence history import: Meta sends the phone's last 6 months of 1:1
// chats in chunks (possibly out of order), one thread per customer. Saved
// as past messages: they don't open the 24-hour window or trigger chekelin,
// and a chat where the business already answered starts handed to a person (chekelin comes back after 7 days of silence).
async function saveHistory(
  supabase: Admin,
  book: ContactBook,
  channel: Channel,
  value: WhatsAppValue,
  media: MediaJob[],
) {
  for (const chunk of value.history ?? []) {
    if (chunk.errors?.length) {
      // 2593109 = the business chose not to share its chat history.
      const declined = chunk.errors.some((e) => e.code === 2593109);
      await supabase
        .from("channels")
        .update({ history_sync_error: declined ? "declined" : (chunk.errors[0]?.message ?? "error") })
        .eq("id", channel.id);
      continue;
    }

    for (const thread of chunk.threads ?? []) {
      try {
        await saveHistoryThread(supabase, book, channel, thread, media);
      } catch (error) {
        console.error("whatsapp history thread error", error);
      }
    }

    // Chunks can arrive out of order, so progress only moves forward.
    const progress = Number(chunk.metadata?.progress);
    if (Number.isFinite(progress)) {
      await supabase
        .from("channels")
        .update({ history_sync_progress: progress })
        .eq("id", channel.id)
        .or(`history_sync_progress.is.null,history_sync_progress.lt.${progress}`);
    }
  }
}

async function saveHistoryThread(
  supabase: Admin,
  book: ContactBook,
  channel: Channel,
  thread: WhatsAppHistoryThread,
  media: MediaJob[],
) {
  const customer = thread.id;
  if (!customer) return;

  const rows = (thread.messages ?? []).flatMap((m) => {
    const body = describeMessage(m);
    if (body === null || !m.id) return [];
    // Only the business's own messages carry `to`.
    const out = Boolean(m.to) || !samePhone(m.from, customer);
    return [{ m, body, out }];
  });
  if (rows.length === 0) return;

  const contactId = await findOrCreateContact(supabase, book, channel.business_id, customer, customer);
  const conversation = await findOrCreateConversation(supabase, channel, contactId);
  const fallback = new Date();

  const { error } = await supabase.from("messages").upsert(
    rows.map(({ m, body, out }) => ({
      conversation_id: conversation.id,
      business_id: channel.business_id,
      direction: out ? "out" : "in",
      body,
      external_message_id: m.id,
      status: HISTORY_STATUS[m.history_context?.status?.toUpperCase() ?? ""] ?? "sent",
      source: "history",
      created_at: messageTime(m.timestamp, fallback),
    })),
    // Already in cheke (e.g. arrived live after connecting): keep that copy.
    { onConflict: "external_message_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  // Meta only sends the files of the last 14 days of history; older ones
  // stay "📎 Archivo del historial". Already-saved messages get theirs too.
  for (const { m } of rows) queueMedia(media, channel, m);

  const newest = rows.reduce((max, { m }) => later(max, messageTime(m.timestamp, fallback)), conversation.last_message_at);
  await supabase
    .from("conversations")
    .update({ last_message_at: newest, ...(rows.some((r) => r.out) ? { handed_off_at: newest } : {}) })
    .eq("id", conversation.id);
}

const HISTORY_STATUS: Record<string, "sent" | "delivered" | "read" | "failed"> = {
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};

// Coexistence contacts: the names saved in the business's phone. A customer
// already in Contactos keeps their cheke name unless it's still just their
// number; removals on the phone never delete anything in cheke.
async function syncPhoneContacts(supabase: Admin, book: ContactBook, channel: Channel, value: WhatsAppValue) {
  for (const item of value.state_sync ?? []) {
    if (item.type !== "contact" || item.action !== "add") continue;
    const phone = item.contact?.phone_number;
    const name = item.contact?.full_name || item.contact?.first_name;
    if (!phone || !name) continue;

    try {
      const contacts = await loadContacts(supabase, book, channel.business_id);
      const existing = contacts.find((c) => samePhone(c.phone, phone));
      if (!existing) {
        await findOrCreateContact(supabase, book, channel.business_id, phone, name);
      } else if (!/\p{L}/u.test(existing.name)) {
        await supabase.from("contacts").update({ name }).eq("id", existing.id);
        existing.name = name;
      }
    } catch (error) {
      console.error("whatsapp contact sync error", error);
    }
  }
}

// The business disconnected cheke from inside the WhatsApp Business app
// (Settings → Account → Business Platform). Coexistence numbers can only be
// disconnected there, so mirror it here.
async function handleAccountUpdate(supabase: Admin, wabaId: string | undefined, value: WhatsAppValue) {
  if (!wabaId || value?.event !== "PARTNER_REMOVED") return;
  await supabase
    .from("channels")
    .update({ status: "disconnected", access_token_encrypted: null, registration_pin_encrypted: null })
    .eq("type", "whatsapp")
    .eq("waba_id", wabaId);
}

async function alreadySaved(supabase: Admin, externalMessageId: string): Promise<boolean> {
  const { data } = await supabase.from("messages").select("id").eq("external_message_id", externalMessageId).maybeSingle();
  return Boolean(data);
}

async function loadContacts(supabase: Admin, book: ContactBook, businessId: string) {
  let contacts = book.get(businessId);
  if (!contacts) {
    const { data } = await supabase
      .from("contacts")
      .select("id, phone, name")
      .eq("business_id", businessId)
      .not("phone", "is", null)
      .limit(5000);
    contacts = data ?? [];
    book.set(businessId, contacts);
  }
  return contacts;
}

// The customer may already be in Contactos with their number typed any
// way ("+504 9922-3843"), so compare digits rather than the raw string —
// otherwise every such customer would get a second, duplicate contact.
async function findOrCreateContact(
  supabase: Admin,
  book: ContactBook,
  businessId: string,
  waId: string,
  name: string,
): Promise<string> {
  const contacts = await loadContacts(supabase, book, businessId);
  const found = contacts.find((c) => samePhone(c.phone, waId));
  if (found) return found.id;

  const { data: newContact, error } = await supabase
    .from("contacts")
    .insert({ business_id: businessId, name, phone: waId })
    .select("id")
    .single();
  if (error || !newContact) throw new Error(error?.message ?? "No se pudo crear el contacto.");
  contacts.push({ id: newContact.id, phone: waId, name });
  return newContact.id;
}

async function findOrCreateConversation(
  supabase: Admin,
  channel: Channel,
  contactId: string,
): Promise<{ id: string; last_message_at: string | null }> {
  // limit(1) instead of maybeSingle(): if a race ever created two rows,
  // maybeSingle() would error out and we'd create a third.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, last_message_at")
    .eq("business_id", channel.business_id)
    .eq("contact_id", contactId)
    .eq("channel_id", channel.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (existing?.[0]) return existing[0];

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      business_id: channel.business_id,
      store_id: channel.store_id,
      contact_id: contactId,
      channel_id: channel.id,
      status: "open",
    })
    .select("id, last_message_at")
    .single();
  if (error || !created) throw new Error(error?.message ?? "No se pudo crear la conversación.");
  return created;
}

// Meta can deliver "delivered" before "sent" (or retry an old one), so a
// status only ever moves forward — a late "sent" must not undo a "read".
const STATUS_RANK = { sent: 1, delivered: 2, read: 3, failed: 4 } as const;

async function updateMessageStatus(supabase: Admin, status: WhatsAppStatus) {
  const next = STATUS_RANK[status.status as keyof typeof STATUS_RANK];
  if (!next) return;

  const { data: current } = await supabase
    .from("messages")
    .select("status")
    .eq("external_message_id", status.id)
    .maybeSingle();
  if (!current) return;

  const update: Record<string, unknown> = {};

  // What Meta charged (or didn't) for this message, for future cost
  // analytics. Comes on "sent" and again on "delivered" or "read", so it's
  // saved even when the status itself doesn't move.
  if (status.pricing) {
    update.pricing_billable = status.pricing.billable ?? null;
    update.pricing_type = status.pricing.type ?? null;
    update.pricing_category = status.pricing.category ?? null;
  }

  const currentRank = STATUS_RANK[current.status as keyof typeof STATUS_RANK] ?? 0;
  // "failed" always wins (nothing was delivered); otherwise only move forward.
  if (status.status === "failed" || (currentRank < next && current.status !== "failed")) {
    update.status = status.status;
  }

  // Why it failed, so Chat can tell the business in plain Spanish.
  if (status.status === "failed") {
    const error = status.errors?.[0];
    const metaText =
      [error?.title ?? error?.message, error?.error_data?.details].filter(Boolean).join(" — ") || null;
    update.error_code = error?.code ?? null;
    update.error_details = metaText;
    update.error_reason = explainWhatsAppError(error?.code, metaText);
  }

  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from("messages").update(update).eq("external_message_id", status.id);
  // Migration 0017 not run yet (unknown column): still save the tick itself.
  if (error && update.status) {
    await supabase.from("messages").update({ status: update.status }).eq("external_message_id", status.id);
  }
}

// A photo, voice note, document, location or contact card to save for Chat
// once the webhook has answered (src/lib/messageMedia.ts).
function queueMedia(media: MediaJob[], channel: Channel, message: WhatsAppMessage) {
  const found = whatsappMedia(message);
  if (!found) return;
  if (found.kind === "location" || found.kind === "contacts") {
    media.push({ externalMessageId: message.id, kind: found.kind, info: found.info });
    return;
  }
  // No file to fetch (e.g. old history): the message keeps its text.
  const credentials = credentialsForChannel(channel);
  if (!found.mediaId || !credentials) return;
  media.push({
    externalMessageId: message.id,
    kind: found.kind,
    info: found.info,
    download: {
      whatsappMediaId: found.mediaId,
      accessToken: credentials.accessToken,
      fallbackAccessToken: credentials.fallbackAccessToken,
    },
  });
}

function messageTime(timestamp: string | undefined, fallback: Date): string {
  const ms = Number(timestamp) * 1000;
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : fallback.toISOString();
}

// The later of two timestamps (ISO strings), treating null as "never".
function later(a: string | null, b: string): string {
  return a && new Date(a).getTime() > new Date(b).getTime() ? a : b;
}

// Minimal shape of what we actually read from Meta's payload — not exhaustive.
type WhatsAppWebhookPayload = {
  entry?: Array<{
    id?: string; // the WhatsApp Business Account id
    changes?: Array<{ field?: string; value: WhatsAppValue }>;
  }>;
};
type WhatsAppValue = {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
  message_echoes?: WhatsAppEcho[];
  history?: Array<{
    metadata?: { phase?: number; chunk_order?: number; progress?: number };
    threads?: WhatsAppHistoryThread[];
    errors?: Array<{ code?: number; message?: string }>;
  }>;
  state_sync?: Array<{
    type?: string;
    action?: "add" | "remove";
    contact?: { full_name?: string; first_name?: string; phone_number?: string };
  }>;
  event?: string; // account_update
};
type WhatsAppEcho = WhatsAppMessage & { to: string };
type WhatsAppHistoryThread = {
  id: string; // the customer's WhatsApp number
  messages?: Array<WhatsAppMessage & { to?: string; history_context?: { status?: string } }>;
};
type WhatsAppStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  pricing?: { billable?: boolean; type?: string; category?: string };
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
};
