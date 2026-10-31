import type { BusinessKind, OpeningHours } from "@/lib/services";
export type ChannelType = "whatsapp" | "instagram" | "facebook";

export type Contact = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  ig_handle: string | null;
  fb_id: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
};

export type Channel = {
  id: string;
  business_id: string;
  // The Tienda this channel belongs to (see GLOSSARY.md).
  store_id: string;
  type: ChannelType;
  external_id: string | null;
  status: "disconnected" | "connected" | "error";
  // Coexistencia (migration 0013): the number also works in the WhatsApp
  // Business app on the business's phone.
  coexistence?: boolean;
};

export type ConversationStage = "nuevo" | "consulta" | "cotizacion" | "negociacion" | "ganado" | "perdido";

export type Conversation = {
  id: string;
  business_id: string;
  // Always the Tienda of its channel (set by the database).
  store_id: string;
  contact_id: string;
  channel_id: string | null;
  status: "open" | "pending" | "closed";
  stage: ConversationStage;
  value_hnl: number | null;
  bot_enabled: boolean;
  assigned_to: string | null;
  last_message_at: string | null;
  window_expires_at: string | null;
  created_at: string;
  // Routing and chekelin's Traspaso (migration 0021). Optional so demo data
  // without them still type-checks.
  // Set = chekelin passed the chat to a person (or a person took it).
  handed_off_at?: string | null;
  chekelin_replies?: number;
  // Customer waiting for a person since then (the 5 / 10 minute timers).
  awaiting_since?: string | null;
  // An open Queja (migration 0022): red tag, chekelin silent until resolved.
  complaint_open_at?: string | null;
  // The ad (or post) the chat came from (migration 0039, src/lib/adReferral.ts).
  referral_source?: "anuncio" | "publicación" | null;
  referral_ad_id?: string | null;
  referral_headline?: string | null;
  referral_url?: string | null;
  referral_at?: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  business_id: string;
  // Copied from its conversation by the database.
  store_id?: string;
  direction: "in" | "out";
  body: string | null;
  media_url: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  is_bot: boolean;
  // Where an outgoing message was written: in cheke, on the business's phone
  // (WhatsApp Business app, coexistence), imported chat history, or in the
  // Instagram app / Meta Business Suite (meta_app), or a Campaña
  // (broadcast, migration 0044; also is_bot).
  source?: "cheke" | "phone" | "history" | "meta_app" | "broadcast";
  // Failed sends only: Meta's error code and the Spanish reason shown in Chat.
  error_code?: number | null;
  error_reason?: string | null;
  // Who on the team wrote an outgoing message in cheke (migration 0021).
  // Null for the customer, chekelin and replies from the phone / Meta apps.
  sent_by?: string | null;
  // Photos, voice notes, documents… received (migration 0023). `body` keeps
  // the plain text ("📷 Foto"), shown while the file downloads or if it fails.
  media_kind?: MediaKind | null;
  // In the private "message-media" bucket; Chat shows them via signed links.
  media_path?: string | null;
  // AAC/M4A copy of a voice note, for Safari and iPhone.
  media_m4a_path?: string | null;
  media_info?: MediaInfo | null;
  // Replies, reactions, edits and deletes (migration 0026). Optional so
  // demo data without them still type-checks.
  reply_to_id?: string | null;
  external_message_id?: string | null;
  reaction_in?: string | null;
  reaction_out?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  // A customer's voice note in words (migration 0025): shown under the audio
  // and read by chekelin. Status null = not transcribed (yet, or no API key).
  transcription?: string | null;
  transcription_status?: "done" | "failed" | null;
  created_at: string;
};

export type MediaKind = "image" | "video" | "audio" | "voice" | "document" | "sticker" | "location" | "contacts";

// What's shown with the media; every field is optional.
export type MediaInfo = {
  caption?: string;
  // Documents
  filename?: string;
  size?: number; // bytes
  mime?: string;
  // Locations
  latitude?: number;
  longitude?: number;
  place?: string;
  address?: string;
  // Contact cards
  contacts?: Array<{ name: string; phones: string[] }>;
  // Voice notes sent from Chat: length in seconds.
  duration?: number;
};

// A team-only note on a conversation: chekelin's Traspaso summary, a Queja
// or a payment receipt. Never sent to the customer.
export type ConversationNote = {
  id: string;
  conversation_id: string;
  store_id: string;
  // "team" = written by a person in Chat (author_id), not by chekelin.
  kind: "handoff" | "complaint" | "payment" | "team";
  summary: string;
  reason: string | null;
  author_id?: string | null;
  created_at: string;
};

export type ConversationWithContact = Conversation & {
  contact: Pick<Contact, "id" | "name" | "phone" | "ig_handle" | "fb_id" | "notes" | "tags">;
  channel: Pick<Channel, "id" | "type" | "coexistence"> & { external_id?: string | null } | null;
  last_message_body: string | null;
  // Who wrote it: the list's "Tú:" / "chekelin:" and «Sin responder».
  last_message?: Pick<Message, "direction" | "is_bot" | "source" | "sent_by"> | null;
  // "No leídos": the customer's messages nobody on the team has seen yet
  // (src/lib/unread.ts). Missing = 0.
  unread_count?: number;
};

export type TemplateCategory = "precios" | "pagos" | "envios" | "bienvenida" | "seguimiento";

export type Template = {
  id: string;
  business_id: string;
  name: string;
  category: TemplateCategory;
  body: string;
  created_at: string;
};

// A Sugerencia de chekelin: a proposed Plantilla, saved only once a Gerente
// or Dueño approves it.
export type TemplateSuggestion = {
  id: string;
  question: string;
  times: number;
  name: string;
  category: TemplateCategory;
  body: string;
  created_at: string;
};

export type TeamMember = {
  user_id: string;
  email: string;
  role: "owner" | "manager" | "agent";
  joined_at: string;
  // From the sign-in profile; null when never set (migration 0021).
  name?: string | null;
  // Ausente: receives no new conversations.
  away?: boolean;
  // Dueños: "avisarme de todo".
  notify_all?: boolean;
};

export type Product = {
  id: string;
  business_id: string;
  // Each Tienda has its own catalog.
  store_id: string;
  retailer_id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_hnl: number;
  image_url: string | null;
  // The DB still has a `stock` column, unused: products are informative only.
  visible: boolean;
  // Minutes a Servicio takes (Tiendas de servicios, migration 0049); null for products.
  duration_min?: number | null;
  meta_sync_status: string;
  created_at: string;
};

// "Lo que chekelin sabe de tu negocio" (migration 0022): one per Tienda.
// address_form "mirror" = talk to each customer the way they write
// (tú / vos / usted).
export type AddressForm = "mirror" | "tu" | "vos" | "usted";

export type ChekelinInfo = {
  payment_methods: string;
  shipping: string;
  delivery_hours: string;
  returns_policy: string;
  faq: string;
  address_form: AddressForm;
  // Migration 0049 (src/lib/services.ts). Missing = products, no horario.
  business_kind?: BusinessKind;
  opening_hours?: OpeningHours | null;
};

// The free-text answers of "Lo que chekelin sabe".
export type ChekelinTextField = Exclude<keyof ChekelinInfo, "address_form" | "business_kind" | "opening_hours">;

export const EMPTY_CHEKELIN_INFO: ChekelinInfo = {
  payment_methods: "",
  shipping: "",
  delivery_hours: "",
  returns_policy: "",
  faq: "",
  address_form: "mirror",
};
