import type {
  ChannelType,
  Contact,
  ConversationStage,
  ConversationWithContact,
  Message,
  Product,
  Template,
  TeamMember,
} from "@/lib/types";
import type { NotificationItem } from "@/lib/notifications";
import type { CurrentBusiness } from "@/lib/business";
import type { ChannelItem } from "@/app/(app)/channels/ChannelsView";

// Sample data for the /demo showcase (an iPhone-framed walkthrough of the
// app). Entirely fictional — never read from or written to the database.
export const DEMO_BASE = "/demo/app";
const H = 3600000;

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
    contact_id: `c-${i}`,
    channel_id: "ch1",
    status: "open",
    stage,
    value_hnl: val,
    bot_enabled: i === 1,
    assigned_to: null,
    last_message_at: iso(ago),
    window_expires_at: null,
    created_at: iso(ago + 5 * H),
    contact: {
      id: `c-${i}`,
      name,
      phone: ch === "whatsapp" ? `+504 9${i}00-12${i}4` : null,
      ig_handle: ch === "instagram" ? "@" + name.split(" ")[0].toLowerCase() : null,
      fb_id: ch === "facebook" ? "fb.me/" + name.split(" ")[0].toLowerCase() : null,
      notes: i === 2 ? "Prefiere pagar por transferencia." : null,
    },
    channel: { id: "ch1", type: ch },
    last_message_body: last,
  }));

  const msg = (id: string, direction: "in" | "out", body: string, ago: number, status: Message["status"], is_bot = false): Message => ({
    id, conversation_id: "conv-1", business_id: "demo", direction, body, media_url: null, status, is_bot, created_at: iso(ago),
  });
  const messages: Message[] = [
    msg("m1", "in", "Hola, quiero saber el precio de la guitarra", 30 * 60000, "read"),
    msg("m2", "out", "¡Hola Juan! La guitarra acústica cuesta L 4,500 y la tenemos en negro y café. ¿Te la enviamos?", 29 * 60000, "read", true),
    msg("m3", "in", "Sí, cuánto sale el envío a Choluteca?", 12 * 60000, "read"),
    msg("m4", "out", "El envío a Choluteca son L 120 y llega en 2 días.", 8 * 60000, "read"),
  ];

  const products: Product[] = (
    [
      ["Guitarra acústica", "Instrumentos", 4500, 3],
      ["Ukelele soprano", "Instrumentos", 1800, 8],
      ["Cuerdas D'Addario", "Accesorios", 350, 2],
      ["Correa de cuero", "Accesorios", 280, 15],
      ["Afinador digital", "Accesorios", 220, 0],
      ["Estuche rígido", "Accesorios", 950, 6],
    ] as Array<[string, string, number, number]>
  ).map(([name, category, price, stock], i) => ({
    id: `p${i}`,
    business_id: "demo",
    retailer_id: `r${i}`,
    name,
    description: "Disponible en negro y café.",
    category,
    price_hnl: price,
    image_url: null,
    stock,
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

  const business: CurrentBusiness = { id: "demo", name: "Tienda Luna", plan: "pro", inviteCode: "LUNA-2026", role: "owner" };
  const members: TeamMember[] = [
    { user_id: "u1", email: "fernando@tiendaluna.hn", role: "owner", joined_at: iso(90 * 24 * H) },
    { user_id: "u2", email: "sofia@tiendaluna.hn", role: "agent", joined_at: iso(20 * 24 * H) },
  ];

  const notifications: NotificationItem[] = [
    { id: "n1", kind: "message", title: "Juan Pérez", description: "Sí, cuánto sale el envío a Choluteca?", time: iso(0.2 * H), link: `${DEMO_BASE}/chat` },
    { id: "n2", kind: "warning", title: "Fátima Reyes lleva 3 días sin respuesta", description: "Requiere seguimiento antes de que se enfríe.", time: iso(2 * H), link: `${DEMO_BASE}/chekeo` },
    { id: "n3", kind: "warning", title: "Poco inventario: Cuerdas D'Addario", description: "Quedan 2 unidades.", time: iso(5 * H), link: `${DEMO_BASE}/inventory` },
    { id: "n4", kind: "success", title: "Venta cerrada: Ana Mejía", description: "L 3,200 ganados.", time: iso(26 * H), link: `${DEMO_BASE}/chekeo` },
  ];

  const channels: ChannelItem[] = [
    { id: "ch1", type: "whatsapp", status: "connected", external_id: "demo", display_phone: "+504 9100-1214", verified_name: "Tienda Luna", connected_at: iso(3 * 24 * H) },
  ];

  return { conversations, messages, products, contacts, templates, business, members, notifications, channels };
}
