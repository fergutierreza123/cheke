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
  type: ChannelType;
  external_id: string | null;
  status: "disconnected" | "connected" | "error";
};

export type ConversationStage = "nuevo" | "consulta" | "cotizacion" | "negociacion" | "ganado" | "perdido";

export type Conversation = {
  id: string;
  business_id: string;
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
};

export type Message = {
  id: string;
  conversation_id: string;
  business_id: string;
  direction: "in" | "out";
  body: string | null;
  media_url: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  is_bot: boolean;
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

export type TeamMember = {
  user_id: string;
  email: string;
  role: "owner" | "agent";
  joined_at: string;
};

export type Product = {
  id: string;
  business_id: string;
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
