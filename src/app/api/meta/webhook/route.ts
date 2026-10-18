import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/whatsapp";
import { fetchMetaProfile, metaCredentialsForChannel } from "@/lib/metaMessaging";
import { handleInboundMessage } from "@/lib/bot";
import { saveMessageMedia, type MediaJob } from "@/lib/messageMedia";
import { processComments, saveIncomingComments } from "@/lib/commentsServer";
import { deletedFields, metaReaction, metaReplyTo } from "@/lib/messageEvents";
import { findMessageId, insertMessage } from "@/lib/messageRows";

// Instagram DMs and Facebook Messenger webhook (Messenger Platform), one URL
// for every business: Meta tells us which Page (object "page") or Instagram
// account (object "instagram") each event is for, and we route it to the
// channel with that external_id. Same rules as the WhatsApp webhook: verify
// the signature, answer 200 fast, never throw.
//
// Comentarios (issue #43): Page comments arrive as entry.changes with field
// "feed", Instagram comments with field "comments". They're handled apart
// from messages, in handleCommentChanges (src/lib/commentsServer.ts).

export const maxDuration = 60;

// Meta calls this once, when the webhook URL is saved in the App Dashboard.
// Same verify token as the WhatsApp webhook.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  let result: HandleResult = { saved: [], echoes: [], media: [] };
  try {
    result = await handlePayload(payload);
  } catch (error) {
    // Still 200: Meta only needs to stop retrying. We fix bugs from the logs.
    console.error("meta webhook error", error);
  }

  await handleCommentChanges(payload);

  // Photos, voice notes, files: Meta's links expire, so they're saved right
  // after answering Meta, never before (src/lib/messageMedia.ts).
  if (result.media.length > 0) {
    after(() => saveMessageMedia(createAdminClient(), result.media));
  }

  if (result.saved.length > 0 || result.echoes.length > 0) {
    after(async () => {
      const supabase = createAdminClient();
      // chekelin answers (after a natural 3–10 s pause with "escribiendo…")
      // or hands off; otherwise the chat goes to a person and only they are
      // alerted (src/lib/bot.ts). Once per conversation, conversations in
      // parallel, and alongside the echoes: a person replying from the
      // Instagram app must be saved in time to stop chekelin's pending reply.
      const latest = new Map<string, SavedMessage>();
      for (const item of result.saved) latest.set(item.conversationId, item);
      const inbound = [...latest.values()].map((item) =>
        handleInboundMessage(supabase, item.conversationId, { preview: item.body }).catch((error) =>
          console.error("inbound handling error", error),
        ),
      );

      // Echoes = messages the business sent. When cheke itself sent one, the
      // echo can arrive before the send finished saving Meta's message id,
      // so wait a moment and then skip anything cheke already has.
      const echoes = async () => {
        if (result.echoes.length === 0) return;
        await new Promise((resolve) => setTimeout(resolve, ECHO_DELAY_MS));
        const media: MediaJob[] = [];
        for (const echo of result.echoes) {
          try {
            const job = await saveEchoMessage(supabase, echo);
            if (job) media.push(job);
          } catch (error) {
            console.error("meta echo error", echo.event.message?.mid, error);
          }
        }
        await saveMessageMedia(supabase, media);
      };
      await Promise.all([...inbound, echoes()]);
    });
  }

  return NextResponse.json({ ok: true });
}

const ECHO_DELAY_MS = 4000;

// Comentarios: save new comments now (fast), and after answering Meta
// chekelin reads them, answers in public and queues the private replies.
async function handleCommentChanges(payload: MetaWebhookPayload): Promise<void> {
  try {
    const supabase = createAdminClient();
    const ids = await saveIncomingComments(supabase, payload);
    if (ids.length > 0) after(() => processComments(createAdminClient(), ids));
  } catch (error) {
    console.error("meta webhook comments error", error);
  }
}

type Admin = ReturnType<typeof createAdminClient>;
type NetworkType = "instagram" | "facebook";
// A channel belongs to one Tienda: its conversations (and their messages)
// go to that Tienda. Contacts are matched across the whole Negocio.
type Channel = {
  id: string;
  business_id: string;
  store_id: string;
  type: NetworkType;
  external_id: string;
  page_id: string | null;
  access_token_encrypted: string | null;
};
type SavedMessage = {
  businessId: string;
  storeId: string;
  conversationId: string;
  contactName: string;
  body: string | null;
};
type PendingEcho = { channel: Channel; event: MessagingEvent };
type HandleResult = { saved: SavedMessage[]; echoes: PendingEcho[]; media: MediaJob[] };

async function handlePayload(payload: MetaWebhookPayload): Promise<HandleResult> {
  const result: HandleResult = { saved: [], echoes: [], media: [] };
  const type: NetworkType | null =
    payload.object === "page" ? "facebook" : payload.object === "instagram" ? "instagram" : null;
  if (!type) return result;

  const supabase = createAdminClient();
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;

  for (const entry of payload.entry ?? []) {
    // `standby` = events delivered while another app (e.g. Meta's own
    // inbox) is in charge of the thread; they're still the business's
    // messages, so they're saved the same way.
    const events = [...(entry.messaging ?? []), ...(entry.standby ?? [])];
    if (!entry.id || events.length === 0) continue;

    const { data: channel } = await supabase
      .from("channels")
      .select("id, business_id, store_id, type, external_id, page_id, access_token_encrypted")
      .eq("type", type)
      .eq("external_id", entry.id)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle<Channel>();
    // Nobody has this Page / Instagram account connected (anymore).
    if (!channel) continue;

    // One bad event must not drop the rest of the batch.
    for (const event of events) {
      try {
        // Reactions, edits and deletes change a message already in the chat.
        // The account itself = the business ("out"); anyone else = customer.
        const side = event.sender?.id === channel.external_id ? "out" : "in";
        if (event.reaction) {
          await applyReaction(supabase, channel, event, side);
        } else if (event.message_edit) {
          await applyEdit(supabase, channel, event, side);
        } else if (event.message?.is_deleted) {
          await applyDelete(supabase, channel, event, event.message.is_echo ? "out" : side);
        } else if (event.message?.is_echo) {
          // Sent by this app (an agent or chekelin in cheke): already saved.
          if (appId && event.message.app_id && String(event.message.app_id) === appId) continue;
          result.echoes.push({ channel, event });
        } else if (event.message || event.postback) {
          const saved = await saveInboundMessage(supabase, channel, event);
          if (saved) {
            result.saved.push({ businessId: channel.business_id, storeId: channel.store_id, ...saved });
            const job = mediaJob(event.message);
            if (job) result.media.push(job);
          }
        } else if (event.delivery) {
          for (const mid of event.delivery.mids ?? []) await advanceStatus(supabase, mid, "delivered");
        } else if (event.read) {
          await markRead(supabase, channel, event);
        }
      } catch (error) {
        console.error("meta webhook event error", event.message?.mid, error);
      }
    }
  }
  return result;
}

async function saveInboundMessage(
  supabase: Admin,
  channel: Channel,
  event: MessagingEvent,
): Promise<{ conversationId: string; contactName: string; body: string | null } | null> {
  const customerId = event.sender?.id;
  // Anything the account itself "sent to itself" isn't a customer message.
  if (!customerId || customerId === channel.external_id) return null;

  const body = event.message ? describeMessage(event.message) : (event.postback?.title ?? null);
  if (body === null) return null;

  const mid = event.message?.mid ?? event.postback?.mid ?? `postback:${customerId}:${event.timestamp ?? ""}`;
  if (await alreadySaved(supabase, mid)) return null; // Meta redelivered it

  const contact = await findOrCreateContact(supabase, channel, customerId);
  const conversation = await findOrCreateConversation(supabase, channel, contact.id);

  const now = new Date();
  const windowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("conversations")
    // A customer writing again reopens a conversation that had been closed.
    .update({ last_message_at: now.toISOString(), window_expires_at: windowExpiresAt, status: "open" })
    .eq("id", conversation.id);

  const { error } = await insertMessage(supabase, {
    conversation_id: conversation.id,
    business_id: channel.business_id,
    direction: "in",
    body,
    external_message_id: mid,
    status: "sent",
    created_at: messageTime(event.timestamp, now),
    reply_to_id: await findMessageId(supabase, channel.business_id, metaReplyTo(event.message)),
  });
  if (error) {
    // 23505 = the same message arrived twice at once; the other copy won.
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }

  return { conversationId: conversation.id, contactName: contact.name, body };
}

// A reply the business wrote outside cheke (Instagram app, Meta Business
// Suite, the Page inbox). Shown in the chat like any reply, and it counts as
// a person replying: chekelin goes silent, the timers stop and an unassigned
// chat goes to the Dueño (database trigger, migration 0021). It doesn't touch
// the reply window: only the customer's messages open it.
async function saveEchoMessage(supabase: Admin, { channel, event }: PendingEcho): Promise<MediaJob | null> {
  const message = event.message;
  const customerId = event.recipient?.id;
  if (!message?.mid || !customerId) return null;
  const body = describeMessage(message);
  if (body === null) return null;
  if (await alreadySaved(supabase, message.mid)) return null;

  const contact = await findOrCreateContact(supabase, channel, customerId);
  const conversation = await findOrCreateConversation(supabase, channel, contact.id);
  const sentAt = messageTime(event.timestamp, new Date());

  const { error } = await insertMessage(supabase, {
    conversation_id: conversation.id,
    business_id: channel.business_id,
    direction: "out",
    body,
    external_message_id: message.mid,
    status: "sent",
    source: "meta_app",
    created_at: sentAt,
    reply_to_id: await findMessageId(supabase, channel.business_id, metaReplyTo(message)),
  });
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: later(conversation.last_message_at, sentAt) })
    .eq("id", conversation.id);
  return mediaJob(message);
}

// A ❤️ (or any reaction) on a message, or taking it back.
async function applyReaction(supabase: Admin, channel: Channel, event: MessagingEvent, side: "in" | "out") {
  const reaction = metaReaction(event.reaction);
  if (!reaction) return;
  await supabase
    .from("messages")
    .update(side === "in" ? { reaction_in: reaction.emoji } : { reaction_out: reaction.emoji })
    .eq("business_id", channel.business_id)
    .eq("external_message_id", reaction.targetId);
}

// The author changed the text of a message they had sent.
async function applyEdit(supabase: Admin, channel: Channel, event: MessagingEvent, side: "in" | "out") {
  const edit = event.message_edit;
  if (!edit?.mid || typeof edit.text !== "string") return;
  await supabase
    .from("messages")
    .update({ body: edit.text, edited_at: messageTime(event.timestamp, new Date()) })
    .eq("business_id", channel.business_id)
    .eq("external_message_id", edit.mid)
    .eq("direction", side);
}

// The author deleted ("unsent") a message: Chat shows "Mensaje eliminado".
async function applyDelete(supabase: Admin, channel: Channel, event: MessagingEvent, side: "in" | "out") {
  const mid = event.message?.mid;
  if (!mid) return;
  await supabase
    .from("messages")
    .update(deletedFields(messageTime(event.timestamp, new Date())))
    .eq("business_id", channel.business_id)
    .eq("external_message_id", mid)
    .eq("direction", side);
}

// What to show in the chat for each kind of message. Returns null for
// things that aren't conversation messages.
function describeMessage(message: MetaMessage): string | null {
  if (message.is_deleted) return null;
  if (message.text) return message.text;
  const attachment = message.attachments?.[0];
  if (!attachment) return message.is_unsupported ? "Mensaje de un tipo que cheke todavía no puede mostrar" : null;
  switch (attachment.type) {
    case "image":
      return "📷 Foto";
    case "video":
      return "🎥 Video";
    case "audio":
      return "🎤 Nota de voz";
    case "file":
      return "📄 Archivo";
    case "story_mention":
      return "📣 Te mencionó en su historia";
    case "share":
    case "ig_reel":
    case "reel":
    case "ig_post":
      return "🔗 Publicación compartida";
    case "location":
      return "📍 Ubicación";
    default:
      return "📎 Archivo adjunto";
  }
}

// The photo, video, audio, file or location of a message, for Chat to show
// it. Files come as a temporary link (it expires), downloaded right away.
function mediaJob(message: MetaMessage | undefined): MediaJob | null {
  const attachment = message?.attachments?.[0];
  const mid = message?.mid;
  if (!mid || !attachment) return null;
  const url = attachment.payload?.url;

  if (attachment.type === "location") {
    const { lat, long } = attachment.payload?.coordinates ?? {};
    if (typeof lat !== "number" || typeof long !== "number") return null;
    return {
      externalMessageId: mid,
      kind: "location",
      info: { latitude: lat, longitude: long, ...(attachment.title ? { place: attachment.title } : {}) },
    };
  }
  // View-once media comes without a link: it keeps its text.
  if (!url) return null;
  switch (attachment.type) {
    case "image":
      return { externalMessageId: mid, kind: attachment.payload?.sticker_id ? "sticker" : "image", info: {}, download: { url } };
    case "video":
    case "audio":
      return { externalMessageId: mid, kind: attachment.type, info: {}, download: { url } };
    case "file": {
      const filename = fileNameFromUrl(url);
      return { externalMessageId: mid, kind: "document", info: filename ? { filename } : {}, download: { url } };
    }
    default:
      return null;
  }
}

// Messenger file links end in the file's name ("…/cotizacion.pdf?…").
function fileNameFromUrl(url: string): string | null {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return /\.[a-z0-9]{1,8}$/i.test(name) ? name : null;
  } catch {
    return null;
  }
}

async function alreadySaved(supabase: Admin, externalMessageId: string): Promise<boolean> {
  const { data } = await supabase.from("messages").select("id").eq("external_message_id", externalMessageId).maybeSingle();
  return Boolean(data);
}

// Customers are matched by the id Meta gives them for this business's Page
// (fb_psid) or Instagram account (ig_id) — never by the handle typed in
// Contactos, which anyone on the team can edit.
async function findOrCreateContact(
  supabase: Admin,
  channel: Channel,
  customerId: string,
): Promise<{ id: string; name: string }> {
  const column = channel.type === "instagram" ? "ig_id" : "fb_psid";
  const lookup = () =>
    supabase
      .from("contacts")
      .select("id, name")
      .eq("business_id", channel.business_id)
      .eq(column, customerId)
      .limit(1)
      .maybeSingle<{ id: string; name: string }>();

  const { data: existing } = await lookup();
  if (existing) return existing;

  const profile = await fetchMetaProfile(channel.type, customerId, metaCredentialsForChannel(channel));
  const fallbackName = channel.type === "instagram" ? "Cliente de Instagram" : "Cliente de Facebook";
  const name = profile.name || (profile.username ? `@${profile.username}` : fallbackName);

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({
      business_id: channel.business_id,
      name,
      [column]: customerId,
      ...(profile.username ? { ig_handle: `@${profile.username}` } : {}),
    })
    .select("id, name")
    .single();
  if (created) return created;

  // Two events for a new customer at once: the other one created it.
  if (error?.code === "23505") {
    const { data: raced } = await lookup();
    if (raced) return raced;
  }
  throw new Error(error?.message ?? "No se pudo crear el contacto.");
}

async function findOrCreateConversation(
  supabase: Admin,
  channel: Channel,
  contactId: string,
): Promise<{ id: string; last_message_at: string | null }> {
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

// A status only moves forward (sent → delivered → read), never back.
async function advanceStatus(supabase: Admin, mid: string, status: "delivered" | "read") {
  const allowedFrom = status === "delivered" ? ["sent"] : ["sent", "delivered"];
  await supabase.from("messages").update({ status }).eq("external_message_id", mid).in("status", allowedFrom);
}

// Messenger reports "read up to this time" (watermark); Instagram names the
// message that was read. Either way, everything we sent before it is read.
async function markRead(supabase: Admin, channel: Channel, event: MessagingEvent) {
  const customerId = event.sender?.id;
  if (!customerId) return;

  let upTo: string | null = null;
  if (event.read?.watermark) {
    upTo = new Date(event.read.watermark).toISOString();
  } else if (event.read?.mid) {
    const { data } = await supabase
      .from("messages")
      .select("created_at")
      .eq("external_message_id", event.read.mid)
      .maybeSingle();
    upTo = data?.created_at ?? null;
  }
  if (!upTo) return;

  const column = channel.type === "instagram" ? "ig_id" : "fb_psid";
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("business_id", channel.business_id)
    .eq(column, customerId)
    .limit(1)
    .maybeSingle();
  if (!contact) return;

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id")
    .eq("business_id", channel.business_id)
    .eq("contact_id", contact.id)
    .eq("channel_id", channel.id);
  const ids = (conversations ?? []).map((c) => c.id);
  if (ids.length === 0) return;

  await supabase
    .from("messages")
    .update({ status: "read" })
    .in("conversation_id", ids)
    .eq("direction", "out")
    .in("status", ["sent", "delivered"])
    .lte("created_at", upTo);
}

// Messenger Platform timestamps are in milliseconds.
function messageTime(timestamp: number | undefined, fallback: Date): string {
  const ms = Number(timestamp);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : fallback.toISOString();
}

function later(a: string | null, b: string): string {
  return a && new Date(a).getTime() > new Date(b).getTime() ? a : b;
}

// Minimal shape of what we read from Meta's payload — not exhaustive.
type MetaWebhookPayload = {
  object?: string; // "page" | "instagram"
  entry?: Array<{
    id?: string; // Page id or Instagram account id
    time?: number;
    messaging?: MessagingEvent[];
    standby?: MessagingEvent[];
  }>;
};
type MetaMessage = {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  app_id?: number | string;
  is_deleted?: boolean;
  is_unsupported?: boolean;
  reply_to?: { mid?: string; story?: { url?: string; id?: string } };
  attachments?: Array<{
    type?: string;
    title?: string;
    payload?: { url?: string; sticker_id?: number; coordinates?: { lat?: number; long?: number } };
  }>;
};
type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: MetaMessage;
  postback?: { mid?: string; title?: string; payload?: string };
  delivery?: { mids?: string[]; watermark?: number };
  read?: { watermark?: number; mid?: string };
  reaction?: { mid?: string; action?: string; reaction?: string; emoji?: string };
  message_edit?: { mid?: string; text?: string; num_edit?: number };
};
