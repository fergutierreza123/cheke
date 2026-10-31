import type { ChekelinInfo } from "@/lib/types";
import type {
  ChannelType,
  Contact,
  ConversationNote,
  ConversationStage,
  ConversationWithContact,
  Message,
  Product,
  Template,
  TeamMember,
} from "@/lib/types";
import type { NotificationItem } from "@/lib/notifications";
import type { CurrentBusiness } from "@/lib/stores";
import type { ChannelItem } from "@/app/(app)/channels/ChannelsView";
import type { WhatsAppTemplate } from "@/lib/whatsappTemplates";
import type { StoreLocation } from "@/lib/storeLocation";
import type { CommentRow } from "@/lib/comments";

// Sample data for the /demo showcase (an iPhone-framed walkthrough of the
// app). Entirely fictional — never read from or written to the database.
export const DEMO_BASE = "/demo/app";
const DEMO_STORE = { id: "demo-store", name: "Tienda Luna", archived: false };
const H = 3600000;

// Sample WhatsApp templates Meta "approved" for the demo number: what
// "Enviar plantilla" offers in a WhatsApp chat whose 24 h window closed.
export const DEMO_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "wt-demo-1",
    name: "seguimiento_pedido",
    language: "es",
    status: "APPROVED",
    category: "UTILITY",
    components: [{ type: "BODY", text: "Hola {{1}}, te escribimos de Tienda Luna sobre tu pedido de {{2}}. ¿Te lo enviamos esta semana?" }],
  },
  {
    id: "wt-demo-2",
    name: "nueva_coleccion",
    language: "es",
    status: "APPROVED",
    category: "MARKETING",
    components: [
      { type: "BODY", text: "¡Hola {{1}}! Llegó la nueva colección de Tienda Luna. ¿Quieres que te mandemos fotos?" },
      { type: "FOOTER", text: "Responde «no» si no quieres recibir novedades." },
    ],
  },
  {
    id: "wt-demo-3",
    name: "recordatorio_pago",
    language: "es",
    status: "PENDING",
    category: "UTILITY",
    components: [{ type: "BODY", text: "Hola {{1}}, tu pedido sigue apartado. Avísanos cuando hagas el depósito." }],
  },
];

export function buildDemoData(now: number) {
  const iso = (ago: number) => new Date(now - ago).toISOString();

  const people: Array<[string, ChannelType, ConversationStage, string, number, number | null]> = [
    ["Fátima Reyes", "facebook", "consulta", "Buena pregunta, pero no te...", 72 * H, null],
    ["Juan Pérez", "whatsapp", "nuevo", "Sí, cuánto sale el envío a Choluteca?", 0.2 * H, null],
    ["María López", "instagram", "cotizacion", "¿Hacen envíos a San Pedro Sula?", 2 * H, 4500],
    ["Carlos Díaz", "whatsapp", "negociacion", "Te confirmo mañana el depósito", 5 * H, 9800],
    ["Ana Mejía", "whatsapp", "ganado", "Gracias, ya me llegó 🙌", 26 * H, 3200],
    ["Luis Funes", "instagram", "nuevo", "¿Tienen en color negro?", 1 * H, null],
  ];

  const conversations: ConversationWithContact[] = people.map(([name, ch, stage, last, ago, val], i) => ({
    id: `conv-${i}`,
    business_id: "demo",
    store_id: DEMO_STORE.id,
    contact_id: `c-${i}`,
    channel_id: "ch1",
    status: "open",
    stage,
    value_hnl: val,
    bot_enabled: i === 1,
    assigned_to: null,
    last_message_at: iso(ago),
    // WhatsApp chats quiet for more than 24 h show "Enviar plantilla".
    window_expires_at: ch === "whatsapp" && ago > 24 * H ? iso(ago - 24 * H) : null,
    created_at: iso(ago + 5 * H),
    contact: {
      id: `c-${i}`,
      name,
      phone: ch === "whatsapp" ? `+504 9${i}00-12${i}4` : null,
      ig_handle: ch === "instagram" ? "@" + name.split(" ")[0].toLowerCase() : null,
      fb_id: ch === "facebook" ? "fb.me/" + name.split(" ")[0].toLowerCase() : null,
      notes: i === 2 ? "Prefiere pagar por transferencia." : null,
      tags: i === 2 ? ["cliente frecuente"] : [],
    },
    channel: { id: "ch1", type: ch, coexistence: ch === "whatsapp", external_id: null },
    last_message_body: last,
    // "No leídos": María and Luis wrote and nobody has opened their chats.
    unread_count: i === 2 ? 2 : i === 5 ? 1 : 0,
  }));
  // Newest first, like the real list (src/lib/conversations.ts).
  conversations.sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));

  const msg = (id: string, direction: "in" | "out", body: string, ago: number, status: Message["status"], is_bot = false): Message => ({
    id, conversation_id: "conv-1", business_id: "demo", direction, body, media_url: null, status, is_bot, created_at: iso(ago),
  });
  const messages: Message[] = [
    msg("m1", "in", "Hola, quiero saber el precio de la guitarra", 30 * 60000, "read"),
    msg("m2", "out", "¡Hola Juan! La guitarra acústica cuesta L 4,500 y la tenemos en negro y café. ¿Te la enviamos?", 29 * 60000, "read", true),
    // A quoted reply, a reaction, an edited and a deleted message (issue #51).
    { ...msg("m3", "in", "Sí, cuánto sale el envío a Choluteca?", 12 * 60000, "read"), reply_to_id: "m2" },
    { ...msg("m4", "out", "El envío a Choluteca son L 120 y llega en 2 días.", 8 * 60000, "read"), reaction_in: "👍" },
    { ...msg("m5", "in", "Mensaje eliminado", 6 * 60000, "read"), deleted_at: iso(5 * 60000) },
    { ...msg("m6", "in", "Perfecto, me la apartan para el viernes?", 4 * 60000, "read"), edited_at: iso(3 * 60000) },
  ];

  const products: Product[] = (
    [
      ["Guitarra acústica", "Instrumentos", 4500],
      ["Ukelele soprano", "Instrumentos", 1800],
      ["Cuerdas D'Addario", "Accesorios", 350],
      ["Correa de cuero", "Accesorios", 280],
      ["Afinador digital", "Accesorios", 220],
      ["Estuche rígido", "Accesorios", 950],
    ] as Array<[string, string, number]>
  ).map(([name, category, price], i) => ({
    id: `p${i}`,
    business_id: "demo",
    store_id: DEMO_STORE.id,
    retailer_id: `r${i}`,
    name,
    description: "Disponible en negro y café.",
    category,
    price_hnl: price,
    image_url: null,
    visible: true,
    meta_sync_status: "pending",
    created_at: iso(i * H),
  }));

  const contacts: Contact[] = conversations.map((c) => ({
    id: c.contact.id,
    business_id: "demo",
    name: c.contact.name,
    phone: c.contact.phone,
    ig_handle: c.contact.ig_handle,
    fb_id: c.contact.fb_id,
    tags: [],
    notes: c.contact.notes,
    created_at: c.created_at,
  }));

  const templates: Template[] = [
    { id: "t1", business_id: "demo", name: "Bienvenida", category: "bienvenida", body: "¡Hola! Gracias por escribirnos a Tienda Luna 🎸 ¿En qué te podemos ayudar?", created_at: iso(H) },
    { id: "t2", business_id: "demo", name: "Datos de pago", category: "pagos", body: "Puedes depositar a Banco Atlántida, cuenta 1234-5678. Envíanos la foto del comprobante.", created_at: iso(H) },
    { id: "t4", business_id: "demo", name: "Precio con envío", category: "precios", body: "¡Hola! La {{producto}} cuesta {{precio}}. ¿Te la enviamos a {{ciudad}}?", created_at: iso(H) },
    { id: "t3", business_id: "demo", name: "Envíos", category: "envios", body: "Hacemos envíos a todo el país. Tegucigalpa y San Pedro Sula: 1 día. Resto: 2-3 días.", created_at: iso(H) },
  ];

  // A single-Tienda Negocio, so the demo looks exactly like most customers.
  const business: CurrentBusiness = {
    id: "demo",
    name: "Tienda Luna",
    plan: "pro",
    role: "owner",
    userId: "u1",
    allStores: [DEMO_STORE],
    stores: [DEMO_STORE],
    archivedStores: [],
    multiStore: false,
    selected: DEMO_STORE.id,
    selectedStore: DEMO_STORE,
    scopeStoreIds: [DEMO_STORE.id],
  };
  const members: TeamMember[] = [
    { user_id: "u1", email: "fernando@tiendaluna.hn", role: "owner", joined_at: iso(90 * 24 * H) },
    { user_id: "u2", email: "sofia@tiendaluna.hn", role: "agent", joined_at: iso(20 * 24 * H) },
  ];

  const notifications: NotificationItem[] = [
    { id: "n1", kind: "message", title: "Juan Pérez", description: "Sí, cuánto sale el envío a Choluteca?", time: iso(0.2 * H), link: `${DEMO_BASE}/chat` },
    { id: "n2", kind: "warning", title: "Fátima Reyes lleva 3 días sin respuesta", description: "Requiere seguimiento antes de que se enfríe.", time: iso(2 * H), link: `${DEMO_BASE}/chekeo` },
    { id: "n4", kind: "success", title: "Venta cerrada: Ana Mejía", description: "L 3,200 ganados.", time: iso(26 * H), link: `${DEMO_BASE}/chekeo` },
  ];

  const channels: ChannelItem[] = [
    { id: "ch1", store_id: "demo-store", type: "whatsapp", status: "connected", external_id: "demo", page_id: null, display_phone: "+504 9100-1214", verified_name: "Tienda Luna", connected_at: iso(3 * 24 * H),
      coexistence: true, contacts_sync_requested_at: iso(3 * 24 * H), history_sync_requested_at: iso(3 * 24 * H),
      history_sync_progress: 100, history_sync_error: null },
  ];

  const chekelinInfo: ChekelinInfo = {
    payment_methods: "Transferencia BAC 7300-1122-33 a nombre de Tienda Luna, o depósito en Banco Atlántida.",
    shipping: "Cargo Expreso a todo el país. Tegucigalpa L 80, San Pedro Sula L 120, resto del país L 150. Llega en 1 a 2 días hábiles.",
    delivery_hours: "Se puede recoger en la tienda de col. Palmira, lunes a sábado de 9 a. m. a 5 p. m.",
    returns_policy: "Cambios de talla dentro de 7 días con la etiqueta puesta. No hay devoluciones de dinero.",
    faq: "¿Venden al por mayor? Sí, desde 12 piezas; eso lo ve directamente el equipo.",
    address_form: "mirror",
  };

  // Chat's "Ubicación" and "Lo que chekelin sabe".
  const storeLocation: StoreLocation = {
    address: "Col. Palmira, frente al parque, Tegucigalpa",
    mapsUrl: "",
    latitude: 14.0941,
    longitude: -87.1893,
  };

  // Comentarios: a price question chekelin answered by private, one waiting
  // and a compliment.
  const comment = (c: Partial<CommentRow> & Pick<CommentRow, "id" | "platform" | "author_name" | "body" | "commented_at">): CommentRow => ({
    store_id: DEMO_STORE.id,
    post_caption: "Nueva colección de vestidos 🌸 Tallas S a XL",
    post_permalink: null,
    post_image_url: null,
    author_username: null,
    kind: "other",
    team_summary: null,
    public_reply_body: null,
    public_replied_at: null,
    public_replied_by: null,
    public_reply_error: null,
    private_status: "none",
    private_body: null,
    private_sent_at: null,
    private_error: null,
    conversation_id: null,
    ...c,
  });
  const comments: CommentRow[] = [
    comment({ id: "k1", platform: "instagram", author_name: "Karla Mejía", author_username: "karla.mejia", body: "Precio del vestido azul? 😍", commented_at: iso(0.3 * H), kind: "price" }),
    comment({
      id: "k2", platform: "facebook", author_name: "Douglas Cruz", body: "¿Cuánto cuesta la chaqueta negra?", commented_at: iso(3 * H), kind: "price",
      private_status: "sent", private_body: "¡Hola Douglas! La chaqueta negra está en L 890. ¿Te la apartamos?", private_sent_at: iso(2.9 * H),
      public_reply_body: "¡Hola! Te escribimos por privado 💬", public_replied_at: iso(2.9 * H),
    }),
    comment({ id: "k3", platform: "instagram", author_name: "Yesenia Cálix", author_username: "yesenia.calix", body: "Qué bonitos colores 👏", commented_at: iso(26 * H) }),
  ];

  // Team-only notes on Juan's chat: chekelin asked the team something it
  // didn't know (it keeps attending), after an earlier Traspaso.
  const note = (id: string, kind: ConversationNote["kind"], summary: string, reason: string, ago: number): ConversationNote => ({
    id, conversation_id: "conv-1", store_id: DEMO_STORE.id, kind, summary, reason, created_at: iso(ago),
  });
  const notes: ConversationNote[] = [
    note(
      "n2",
      "handoff",
      "Juan quiere la guitarra acústica en negro, pregunta si se la pueden apartar hasta el viernes y si el envío a Choluteca se puede pagar contra entrega cuando le llegue.",
      "chekelin no tenía la información · sigue atendiendo",
      3 * 60000,
    ),
    note("n1", "handoff", "Pidió precio de la guitarra acústica y del estuche rígido.", "Pide descuento o pedido especial", 25 * 60000),
  ];

  return {
    comments,
    notes,
    conversations,
    messages,
    products,
    contacts,
    templates,
    business,
    members,
    notifications,
    channels,
    chekelinInfo,
    storeLocation,
    storeName: DEMO_STORE.name,
  };
}
