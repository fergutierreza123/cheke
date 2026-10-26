"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ARCHIVED_STORE_READ_ONLY, canManageStore, canWriteToStore, getCurrentBusiness, writableStoreIds } from "@/lib/business";
import { cleanDealValue, isConversationStage } from "@/lib/deals";
import { createAdminClient } from "@/lib/supabase/admin";
import { handOffActiveChats } from "@/lib/bot";
import { CHEKELIN_OFF_OPTIONS, chekelinOffUntil, type ChekelinOffDuration } from "@/lib/chekelinState";
import { primaryChannel, productMessageText } from "@/lib/format";
import { sendChatMessage } from "./chat/actions";
import type { Channel, ChannelType, ConversationStage, ConversationWithContact, Product } from "@/lib/types";
import { friendlyError } from "@/lib/dbErrors";

const DEMO_CONTACTS: Array<{
  name: string;
  phone: string | null;
  ig_handle: string | null;
  fb_id: string | null;
  channel: ChannelType;
  notes: string | null;
  messages: Array<{ direction: "in" | "out"; body: string }>;
}> = [
  {
    name: "Marielos Zúniga",
    phone: "+504 9987-2201",
    ig_handle: null,
    fb_id: null,
    channel: "whatsapp",
    notes: "Preguntó por el vestido azul en la última historia de Instagram.",
    messages: [{ direction: "in", body: "Buenas! Vi el vestido azul en su estado, ¿todavía lo tienen?" }],
  },
  {
    name: "Kevin Rápalo",
    phone: null,
    ig_handle: "@kevin.rapalo",
    fb_id: null,
    channel: "instagram",
    notes: "Primera vez que escribe. Vino desde un anuncio.",
    messages: [{ direction: "in", body: "Hola! ¿Cuánto cuesta el bolso café que publicaron?" }],
  },
  {
    name: "Douglas Cruz",
    phone: "+504 9902-6634",
    ig_handle: null,
    fb_id: null,
    channel: "whatsapp",
    notes: "Compró una chaqueta hace dos meses, ahora pregunta por otra en negro.",
    messages: [
      { direction: "in", body: "Hola, ¿cuánto cuesta la chaqueta de cuero color negro?" },
      { direction: "out", body: "Hola Douglas! La chaqueta está en L 890 con envío incluido a Tegucigalpa." },
      { direction: "in", body: "Perfecto, ¿me pueden mandar el precio con envío incluido?" },
    ],
  },
  {
    name: "Allan Midence",
    phone: "+504 9877-1290",
    ig_handle: null,
    fb_id: null,
    channel: "whatsapp",
    notes: "Pide descuento cuando compra más de dos piezas.",
    messages: [
      { direction: "in", body: "Me interesan 3 vestidos y un bolso a juego." },
      { direction: "out", body: "Con gusto! Ese combo queda en L 2,300 en total." },
    ],
  },
  {
    name: "Yesenia Cálix",
    phone: null,
    ig_handle: "@yesenia.calix",
    fb_id: null,
    channel: "instagram",
    notes: "No respondió después de la cotización del vestido rojo.",
    messages: [{ direction: "out", body: "Hola Yesenia! Aquí tienes el precio del vestido rojo: L 950." }],
  },
  {
    name: "Fátima Reyes",
    phone: null,
    ig_handle: null,
    fb_id: "fatima.reyes.507",
    channel: "facebook",
    notes: null,
    messages: [{ direction: "in", body: "Hola, ¿tienen tallas grandes del vestido negro?" }],
  },
];

const SEED_FAILED = "No se pudieron crear los datos de ejemplo. Inténtalo de nuevo.";

// Demo data for a fresh business so Phase 2 (Chat + Contactos) has something
// real to show before WhatsApp/Instagram/Facebook are actually connected
// (Phase 4+). Safe to call more than once — it's a no-op once the business
// already has contacts.
export async function seedDemoData(): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  // The Tienda on screen (or the first open one, from "Todas las tiendas" or
  // an archived Tienda's history).
  const selected = business.selectedStore?.id;
  const storeId = selected && canWriteToStore(business, selected) ? selected : business.stores[0]?.id;
  if (!storeId) return { error: "Elige una tienda para crear los datos de ejemplo." };

  const supabase = await createClient();

  const { count } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id);
  if (count && count > 0) return {};

  const channelIds: Partial<Record<ChannelType, string>> = {};
  for (const type of ["whatsapp", "instagram", "facebook"] as const) {
    const { data, error } = await supabase
      .from("channels")
      .insert({ business_id: business.id, store_id: storeId, type, status: "connected" })
      .select("id")
      .single();
    if (error || !data) return { error: SEED_FAILED };
    channelIds[type] = data.id;
  }

  const now = Date.now();
  for (const [i, c] of DEMO_CONTACTS.entries()) {
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        business_id: business.id,
        name: c.name,
        phone: c.phone,
        ig_handle: c.ig_handle,
        fb_id: c.fb_id,
        notes: c.notes,
      })
      .select("id")
      .single();
    if (contactError || !contact) return { error: SEED_FAILED };

    const lastMessageAt = new Date(now - (DEMO_CONTACTS.length - i) * 45 * 60 * 1000);

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .insert({
        business_id: business.id,
        contact_id: contact.id,
        channel_id: channelIds[c.channel],
        status: "open",
        last_message_at: lastMessageAt.toISOString(),
      })
      .select("id")
      .single();
    if (convError || !conversation) return { error: SEED_FAILED };

    const messageRows = c.messages.map((m, idx) => ({
      conversation_id: conversation.id,
      business_id: business.id,
      direction: m.direction,
      body: m.body,
      created_at: new Date(lastMessageAt.getTime() + idx * 60 * 1000).toISOString(),
    }));
    const { error: msgError } = await supabase.from("messages").insert(messageRows);
    if (msgError) return { error: SEED_FAILED };
  }

  revalidatePath("/contacts");
  revalidatePath("/chat");
  return {};
}

// Changes to one conversation (chekeo, Chat) only reach open Tiendas the
// person works in. Viewing an archived Tienda's history says why.
async function writableScope(): Promise<{ storeIds: string[]; error?: undefined } | { error: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.selectedStore?.archived) return { error: ARCHIVED_STORE_READ_ONLY };
  return { storeIds: writableStoreIds(business) };
}

// Shared by Chat and Chekeo — both let you tag a conversation's sales stage.
export async function setConversationStage(
  conversationId: string,
  stage: ConversationStage,
): Promise<{ error?: string }> {
  if (!isConversationStage(stage)) return { error: "Etapa inválida." };
  const scope = await writableScope();
  if (scope.error !== undefined) return { error: scope.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ stage })
    .eq("id", conversationId)
    .in("store_id", scope.storeIds)
    .select("id");
  if (error || !data?.length) return { error: "No se pudo mover el contacto. Inténtalo de nuevo." };
  return {};
}

// Shared by Catálogo's "Enviar por chat" and Chat's own product-picker icon
// — sends a product's name, price and photo as a real chat message to an
// existing conversation.
export async function sendProductToConversation(
  conversationId: string,
  product: Pick<Product, "name" | "price_hnl" | "description" | "image_url">,
  caption?: string,
): Promise<{ error?: string }> {
  const text = productMessageText(product, caption);

  const result = await sendChatMessage(conversationId, text, product.image_url);
  if (result.error) return { error: result.error };
  if (result.sendError) return { error: result.sendError };
  return {};
}

export async function setConversationBotEnabled(
  conversationId: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const scope = await writableScope();
  if (scope.error !== undefined) return { error: scope.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    // Turning it back on makes chekelin the first responder again here.
    .update(enabled ? { bot_enabled: true, handed_off_at: null, chekelin_replies: 0 } : { bot_enabled: false })
    .eq("id", conversationId)
    .in("store_id", scope.storeIds)
    .select("id");
  if (error || !data?.length) return { error: friendlyError(error, "No se pudo cambiar a chekelin en este chat.") };
  return {};
}

// chekelin's switch for a whole Tienda (Dueños and its Gerentes): off for
// 1 hour, until tomorrow, 1 week or until turned back on. The chats it was
// handling go to a person right away.
export async function setChekelinOff(storeId: string, duration: ChekelinOffDuration | null): Promise<{ error?: string; until?: string | null }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (!canManageStore(business, storeId)) return { error: "Solo el dueño o el gerente de la tienda puede apagar a chekelin." };
  if (!canWriteToStore(business, storeId)) return { error: ARCHIVED_STORE_READ_ONLY };
  if (duration && !CHEKELIN_OFF_OPTIONS.some((o) => o.id === duration)) return { error: "Opción inválida." };

  const until = duration ? chekelinOffUntil(duration, Date.now()) : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chekelin_off", { p_store_id: storeId, p_until: until });
  if (error) return { error: friendlyError(error) };

  if (until) await handOffActiveChats(createAdminClient(), storeId);
  revalidatePath("/chat");
  return { until };
}

export async function setConversationValue(
  conversationId: string,
  valueHnl: number | null,
): Promise<{ error?: string }> {
  const clean = cleanDealValue(valueHnl);
  if (clean.error) return { error: clean.error };
  const scope = await writableScope();
  if (scope.error !== undefined) return { error: scope.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ value_hnl: clean.value })
    .eq("id", conversationId)
    .in("store_id", scope.storeIds)
    .select("id");
  if (error || !data?.length) return { error: "No se pudo guardar el valor. Inténtalo de nuevo." };
  return {};
}

// Chekeo's "Nuevo contacto": creates a contact plus a conversation for it
// (stage "nuevo") so it shows up on the board immediately, same as any
// other lead — used for leads that didn't come in through a connected
// channel yet (e.g. someone you met in person, or noted down by hand).
export async function createLead(input: {
  name: string;
  phone: string | null;
  ig_handle: string | null;
  fb_id: string | null;
  // Which Tienda the lead belongs to; only asked in "Todas las tiendas".
  storeId?: string | null;
}): Promise<{ conversation?: ConversationWithContact; error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  const storeId = input.storeId || business.selectedStore?.id || (business.multiStore ? null : business.stores[0]?.id);
  if (!storeId) return { error: "Elige la tienda del contacto." };
  if (!canWriteToStore(business, storeId)) {
    const archived = business.archivedStores.some((s) => s.id === storeId);
    return { error: archived ? ARCHIVED_STORE_READ_ONLY : "Elige la tienda del contacto." };
  }

  const name = input.name.trim();
  if (!name) return { error: "Ponle un nombre al contacto." };

  const supabase = await createClient();

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .insert({
      business_id: business.id,
      name,
      phone: input.phone,
      ig_handle: input.ig_handle,
      fb_id: input.fb_id,
    })
    .select("id, name, phone, ig_handle, fb_id, notes")
    .single();

  if (contactError || !contact) return { error: friendlyError(contactError, "No se pudo crear el contacto.") };

  const type = primaryChannel(contact);
  let channel: Pick<Channel, "id" | "type"> | null = null;
  if (type) {
    const { data: channelRow } = await supabase
      .from("channels")
      .select("id, type")
      .eq("business_id", business.id)
      .eq("store_id", storeId)
      .eq("type", type)
      .limit(1)
      .maybeSingle();
    if (channelRow) channel = channelRow;
  }

  const now = new Date().toISOString();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      business_id: business.id,
      store_id: storeId,
      contact_id: contact.id,
      channel_id: channel?.id ?? null,
      status: "open",
      stage: "nuevo",
      last_message_at: now,
    })
    .select("*")
    .single();

  if (convError || !conversation) return { error: friendlyError(convError, "No se pudo crear la conversación.") };

  revalidatePath("/chekeo");
  revalidatePath("/contacts");

  return { conversation: { ...conversation, contact, channel, last_message_body: null } };
}
