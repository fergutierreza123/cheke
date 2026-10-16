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
  // Instagram app / Meta Business Suite (meta_app).
  source?: "cheke" | "phone" | "history" | "meta_app";
  // Failed sends only: Meta's error code and the Spanish reason shown in Chat.
  error_code?: number | null;
  error_reason?: string | null;
  created_at: string;
};

// A team-only note on a conversation: chekelin's Traspaso summary, a Queja
// or a payment receipt. Never sent to the customer.
export type ConversationNote = {
  id: string;
  conversation_id: string;
  store_id: string;
  kind: "handoff" | "complaint" | "payment";
  summary: string;
  reason: string | null;
  created_at: string;
};

export type ConversationWithContact = Conversation & {
  contact: Pick<Contact, "id" | "name" | "phone" | "ig_handle" | "fb_id" | "notes">;
  channel: Pick<Channel, "id" | "type"> | null;
  last_message_body: string | null;
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
  stock: number;
  visible: boolean;
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
};

export const EMPTY_CHEKELIN_INFO: ChekelinInfo = {
  payment_methods: "",
  shipping: "",
  delivery_hours: "",
  returns_policy: "",
  faq: "",
  address_form: "mirror",
};
