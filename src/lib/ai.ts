import Anthropic from "@anthropic-ai/sdk";
import type { AddressForm, ChekelinInfo, Message, Product, Template, TemplateCategory } from "@/lib/types";
import { formatLempiras } from "@/lib/format";

// chekelin: the AI assistant that answers customers and sells on its own
// (answers, sends product photos, takes the order, sends the payment
// details, thanks for the receipt), hands the chat to a person when it
// should (Traspaso), handles complaints (Queja), and proposes Plantillas from
// what the team keeps answering. Design: issues #28 and #40. Server-only —
// never imported from client components.
//
// Every call uses structured output (a JSON schema), so what chekelin decides
// to do comes back as data, not as text to interpret.

// The one place the model is chosen (side-by-side test on issue #42:
// Sonnet 5.5 sounds clearly more human than Haiku 5.5 for selling). To go
// back to the cheaper model, change only this line.
export const CHEKELIN_MODEL = "claude-sonnet-5-5";

// Thinking can't be turned off on this model; "low" keeps it short (it skips
// thinking on most simple messages) and is the recommended level for chat.
const EFFORT = "low" as const;

// Server-side fallback: if the model declines a request for a safety
// category it routes, the API retries on another model in the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

// One structured call. Returns the parsed JSON, or an error in Spanish.
async function structuredCall<T>(input: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<{ data?: T; error?: string; usage?: Anthropic.Beta.BetaUsage }> {
  const anthropic = getClient();
  if (!anthropic) return { error: "Falta configurar ANTHROPIC_API_KEY en el servidor." };
  try {
    const response = await anthropic.beta.messages.create({
      model: CHEKELIN_MODEL,
      max_tokens: input.maxTokens,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      // The instructions and the Tienda's info barely change between
      // messages: cache them.
      system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
      messages: input.messages,
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: input.schema } },
    });
    if (response.stop_reason === "refusal") return { error: "chekelin no pudo responder este mensaje." };
    if (response.stop_reason === "max_tokens") return { error: "La respuesta de chekelin quedó incompleta." };
    // Thinking (and any fallback marker) comes in other block types: read
    // the text block only.
    const text = response.content.find((block) => block.type === "text")?.text;
    if (!text) return { error: "chekelin no generó una respuesta." };
    return { data: JSON.parse(text) as T, usage: response.usage };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error("chekelin api error", error.status, error.message);
      return { error: `Error de la IA (${error.status ?? "sin conexión"}).` };
    }
    console.error("chekelin ai error", error);
    return { error: error instanceof Error ? error.message : "Error al generar la respuesta de chekelin." };
  }
}

// ---------------------------------------------------------------------------
// What chekelin knows: the Tienda's info, Catálogo and Plantillas
// ---------------------------------------------------------------------------

// Products are referred to as P1, P2… so the model never has to copy ids.
export type ProductRef = { ref: string; product: Product };

export function productRefs(products: Product[]): ProductRef[] {
  return products
    .filter((p) => p.visible)
    .slice(0, 40)
    .map((product, i) => ({ ref: `P${i + 1}`, product }));
}

const INFO_FIELDS: Array<{ key: keyof Omit<ChekelinInfo, "address_form">; label: string }> = [
  { key: "payment_methods", label: "Formas de pago" },
  { key: "shipping", label: "Envíos" },
  { key: "delivery_hours", label: "Horario de entregas" },
  { key: "returns_policy", label: "Cambios y devoluciones" },
  { key: "faq", label: "Otras preguntas frecuentes" },
];

function knowledge(info: ChekelinInfo, refs: ProductRef[], templates: Template[]): string {
  const about = INFO_FIELDS.map(({ key, label }) => `${label}: ${info[key].trim() || "(no hay información)"}`).join("\n");

  // Products are informative only: no stock (the Tienda doesn't keep it up to
  // date), so chekelin never says something is or isn't available in stock.
  const catalog = refs
    .map(({ ref, product: p }) => {
      const line = `- ${ref} · ${p.name}${p.category ? ` (${p.category})` : ""}: ${formatLempiras(p.price_hnl)}${p.image_url ? " [tiene foto]" : ""}`;
      // Colors, sizes, materials… live in the description (no variants schema).
      return p.description ? `${line}\n  Detalles: ${p.description}` : line;
    })
    .join("\n");

  const templateNotes = templates
    .slice(0, 20)
    .map((t) => `- [${t.category}] ${t.body}`)
    .join("\n");

  return [
    "## Lo que sabes del negocio",
    about,
    "",
    "## Catálogo",
    catalog || "(todavía no hay productos cargados)",
    "",
    "## Respuestas que usa el equipo (Plantillas; úsalas como información y referencia de tono)",
    templateNotes || "(ninguna)",
  ].join("\n");
}

const ADDRESS_FORM_RULE: Record<AddressForm, string> = {
  mirror:
    'Trato: háblale al cliente como él te habla. Si usa "usted", usa usted; si usa vos ("querés", "tenés"), usa vos; si usa tú ("quieres", "tienes"), usa tú. Mientras no se note, usa vos, que es lo más natural en Honduras.',
  tu: "Trato: háblale siempre de tú (quieres, tienes).",
  vos: 'Trato: háblale siempre de vos ("querés", "tenés"), como se habla en Honduras.',
  usted: "Trato: háblale siempre de usted, con calidez.",
};

// ---------------------------------------------------------------------------
// The seller: chekelin's decision on each customer message
// ---------------------------------------------------------------------------

export type ChekelinAction = "none" | "handoff" | "complaint" | "order_ready" | "payment_receipt";
// Why chekelin passed the chat to a person.
export type HandoffReason = "pide_persona" | "falta_info" | "descuento" | "ninguna";

export type OrderDraft = {
  items: Array<{ product: string; details: string; quantity: number; unit_price_hnl: number }>;
  customer_name: string;
  city: string;
  address: string;
  delivery_method: string;
  shipping_hnl: number;
  total_hnl: number;
};

export type SellerDecision = {
  // What chekelin says to the customer: 0 to 2 messages.
  messages: string[];
  // Catálogo products whose photo + details to send (P1, P2…), at most 3.
  productRefs: string[];
  action: ChekelinAction;
  handoffReason: HandoffReason;
  // For the team only: what the customer wants or what happened.
  teamSummary: string;
  order: OrderDraft;
};

const SELLER_SCHEMA = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: { type: "string" },
      description: "Mensajes para el cliente, en orden. Normalmente 1; 2 si la respuesta es larga. Nunca más de 2.",
    },
    product_refs: {
      type: "array",
      items: { type: "string" },
      description: "Productos del catálogo (P1, P2…) cuya foto y detalles se envían ahora. Máximo 3. Vacío si no aplica.",
    },
    action: { type: "string", enum: ["none", "handoff", "complaint", "order_ready", "payment_receipt"] },
    handoff_reason: { type: "string", enum: ["pide_persona", "falta_info", "descuento", "ninguna"] },
    team_summary: { type: "string", description: "Solo para el equipo: qué quiere el cliente o qué pasó, 1 o 2 oraciones." },
    order: {
      type: "object",
      description: "Solo con action = order_ready. Si no, deja listas vacías, textos vacíos y ceros.",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product: { type: "string" },
              details: { type: "string", description: "Color, talla, etc." },
              quantity: { type: "integer" },
              unit_price_hnl: { type: "number" },
            },
            required: ["product", "details", "quantity", "unit_price_hnl"],
            additionalProperties: false,
          },
        },
        customer_name: { type: "string" },
        city: { type: "string" },
        address: { type: "string" },
        delivery_method: { type: "string" },
        shipping_hnl: { type: "number" },
        total_hnl: { type: "number" },
      },
      required: ["items", "customer_name", "city", "address", "delivery_method", "shipping_hnl", "total_hnl"],
      additionalProperties: false,
    },
  },
  required: ["messages", "product_refs", "action", "handoff_reason", "team_summary", "order"],
  additionalProperties: false,
} as const;

export function sellerPrompt(input: {
  businessName: string;
  info: ChekelinInfo;
  refs: ProductRef[];
  templates: Template[];
  // First name of the Tienda's Gerente (else the Dueño), for complaints.
  managerName: string | null;
  // An order of this chat waiting for payment, if any.
  pendingOrder: { concept: string; totalHnl: number; receiptSent: boolean } | null;
}): string {
  const manager = input.managerName ?? "la persona encargada";
  const pending = input.pendingOrder
    ? `Hay un pedido de este cliente esperando pago: ${input.pendingOrder.concept}, total ${formatLempiras(input.pendingOrder.totalHnl)}. ${
        input.pendingOrder.receiptSent
          ? "El cliente ya mandó su comprobante; el equipo lo está revisando."
          : "Ya se le enviaron los datos para pagar."
      }`
    : "No hay ningún pedido de este cliente esperando pago.";

  return [
    `Atiendes los mensajes de "${input.businessName}", un negocio hondureño que vende por WhatsApp, Instagram y Facebook. Tu trabajo es atender y vender como lo haría una buena vendedora del equipo: contestar, recomendar, tomar el pedido y pasar los datos de pago.`,
    "",
    "# Cómo escribes",
    "- Como una persona por WhatsApp: mensajes cortos, español natural de Honduras, cálido y directo.",
    `- ${ADDRESS_FORM_RULE[input.info.address_form]} Usa un solo trato en toda la conversación, sin mezclar.`,
    '- No sabes el género del cliente: redacta sin marcarlo (nunca "molesta/o", "bienvenido/a").',
    '- Nada de frases de robot: no digas "¡Claro que sí! Con gusto te ayudo", "Estimado cliente", "¿Hay algo más en lo que pueda ayudarte?", "Lamentamos los inconvenientes", "no tengo autorización". No repitas el saludo en cada mensaje.',
    "- Emoji solo cuando salga natural, como mucho uno por mensaje, y muchas veces ninguno.",
    "- messages: normalmente 1 mensaje. Si la respuesta es larga (un resumen de pedido, varias dudas), pártela en 2 mensajes naturales. Nunca más de 2.",
    "- No te presentes ni digas tu nombre. Si el cliente solo saluda, saluda corto y pregúntale qué anda buscando.",
    "- Nunca menciones que eres un bot, una IA o un asistente, ni firmes los mensajes: atiende y ya, como cualquier vendedora del equipo.",
    `- Solo si el cliente te pregunta directamente si es un bot o una persona, no mientas: en una frase natural di que eres el asistente de ${input.businessName} y que con gusto lo pasas con alguien del equipo si prefiere, y sigue ayudando. Nunca digas que eres una persona.`,
    "- No vuelvas a pedir datos que el cliente ya dio en la conversación.",
    '- "📷 Foto" en un mensaje del cliente significa que mandó una foto (no la puedes ver).',
    "",
    "# Lo que sabes y lo que no",
    "- Usa SOLO la información de abajo. Nunca inventes precios, productos, costos de envío, plazos ni políticas.",
    "- El catálogo es informativo: no sabes cuántas unidades hay. No digas que algo está agotado ni cuántas quedan.",
    '- Si algo no está en la información, NO digas que no se puede o que no lo tienen (por ejemplo, nunca "no manejamos contra entrega" si no lo dice). Di en messages, natural y corto, que eso se lo confirmas ("eso te lo confirmo ya"), sigue ayudando con lo demás que preguntó (precio, fotos, tallas) y usa action = "handoff" con handoff_reason = "falta_info". En ese caso tú sigues atendiendo: el equipo recibe la pregunta y le responde. En team_summary escribe la pregunta exacta que no supiste contestar.',

    "",
    "# Cómo vendes",
    '1. Cuando el cliente pida ver un producto o pregunte por uno que todavía no le mostraste, pon su referencia (P1, P2…) en product_refs: se le envía la foto con nombre, precio y detalles. Tu mensaje no repite todo eso; acompaña ("Mirá, esta es la que te digo"). No vuelvas a mandar la foto de un producto que ya le mostraste, salvo que la pida.',
    "2. Para tomar el pedido necesitas: producto, color y talla si aplica, cantidad, nombre, ciudad y dirección, y forma de entrega (según Envíos). Pide solo lo que falte, de a poco. Si no dice cantidad, asume 1 (se ve en el resumen).",
    "3. Con todo listo, manda un resumen: productos con precio, envío, total y dirección, y pregunta si está bien. Calcula bien el total. Aquí action sigue siendo \"none\".",
    '4. Cuando el cliente confirme ese resumen (sí, dale, así está bien), usa action = "order_ready" y llena order con lo confirmado (total = productos + envío). En messages solo algo corto como "¡Perfecto! Ahí te van los datos para pagar": los datos de pago los manda el sistema justo después; no los escribas tú. Si "Formas de pago" no tiene información, usa en cambio action = "handoff", handoff_reason = "falta_info".',
    `5. Si hay un pedido esperando pago y el cliente manda un comprobante (una foto) o dice que ya pagó, usa action = "payment_receipt": dale las gracias y dile que alguien del equipo confirma el pago en un momento. Nunca confirmes tú un pago.`,
    "",
    "# Cuándo pasas el chat a una persona (Traspaso)",
    'Usa action = "handoff" cuando:',
    '- el cliente pide hablar con una persona (handoff_reason = "pide_persona");',
    '- falta información para responder bien (handoff_reason = "falta_info"; ese caso es distinto: tú sigues atendiendo, ver arriba);',
    '- pide descuento, regatea, o quiere un trato especial: por mayor, pedidos personalizados, apartados especiales (handoff_reason = "descuento"). Sin prometer nada; puedes recordar el precio normal y decir que eso lo ve el equipo.',
    'En un handoff (salvo falta_info), messages puede ir vacío o tener un mensaje corto sobre lo que pidió; no digas quién lo va a atender, ni "te paso con alguien", ni "ya te escriben": justo después el sistema manda ese mensaje con el nombre de la persona.',
    "",
    "# Quejas",
    `Si el cliente se queja o está molesto (producto dañado, no le llegó, mal servicio, enojo), usa action = "complaint". En messages: reconoce lo que pasó con empatía de verdad, discúlpate, pide los detalles que falten (qué pedido o fecha, qué pasó, una foto) y dile que ${manager} va a ver su caso personalmente y le responde lo antes posible. Nunca prometas reembolsos, descuentos, cambios ni fechas.`,
    "",
    "# Siempre",
    "- team_summary: para el equipo (el cliente nunca lo ve): qué quiere el cliente (productos, colores, tallas, ciudad…) o qué pasó. Llénalo siempre.",
    "- Nunca des descuentos, nunca confirmes pagos, nunca prometas fechas de entrega que no estén en la información.",
    '- Con action = "none", messages no puede ir vacío.',
    "",
    knowledge(input.info, input.refs, input.templates),
    "",
    "## Estado de esta conversación",
    pending,
  ].join("\n");
}

// The conversation as the model sees it: the customer is "user", everything
// the business sent (chekelin or a person) is "assistant".
function toMessages(history: Pick<Message, "direction" | "body">[]): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = history
    .filter((m) => m.body)
    .slice(-24)
    .map((m) => ({ role: m.direction === "in" ? "user" : "assistant", content: m.body as string }));
  // The API needs the conversation to start and end with the customer.
  while (messages.length > 0 && messages[0].role !== "user") messages.shift();
  return messages;
}

type RawSeller = {
  messages?: string[];
  product_refs?: string[];
  action?: ChekelinAction;
  handoff_reason?: HandoffReason;
  team_summary?: string;
  order?: OrderDraft;
};

export async function decideSeller(args: {
  businessName: string;
  info: ChekelinInfo;
  refs: ProductRef[];
  templates: Template[];
  managerName: string | null;
  pendingOrder: { concept: string; totalHnl: number; receiptSent: boolean } | null;
  history: Pick<Message, "direction" | "body">[];
}): Promise<{ decision?: SellerDecision; error?: string; usage?: Anthropic.Beta.BetaUsage }> {
  const messages = toMessages(args.history);
  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return { error: "No hay un mensaje del cliente al cual responder." };
  }
  const { data, error, usage } = await structuredCall<RawSeller>({
    system: sellerPrompt(args),
    messages,
    schema: SELLER_SCHEMA,
    maxTokens: 4000,
  });
  if (!data) return { error };
  return { decision: normalizeSeller(data), usage };
}

export function normalizeSeller(raw: RawSeller): SellerDecision {
  const order = raw.order ?? ({} as Partial<OrderDraft>);
  return {
    messages: (raw.messages ?? []).map((m) => m.trim()).filter(Boolean).slice(0, 2),
    productRefs: (raw.product_refs ?? []).filter((r) => /^P\d+$/.test(r)).slice(0, 3),
    action: raw.action ?? "none",
    handoffReason: raw.handoff_reason ?? "ninguna",
    teamSummary: (raw.team_summary ?? "").trim(),
    order: {
      items: (order.items ?? []).filter((i) => i.product && i.quantity > 0),
      customer_name: order.customer_name?.trim() ?? "",
      city: order.city?.trim() ?? "",
      address: order.address?.trim() ?? "",
      delivery_method: order.delivery_method?.trim() ?? "",
      shipping_hnl: Number(order.shipping_hnl) || 0,
      total_hnl: Number(order.total_hnl) || 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Simple facts: after the Traspaso, if the person hasn't replied in 5 minutes
// ---------------------------------------------------------------------------

export type SimpleFactDecision = { reply: string; simpleFact: boolean };

const SIMPLE_FACT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    simple_fact: { type: "boolean" },
  },
  required: ["reply", "simple_fact"],
  additionalProperties: false,
} as const;

export async function decideSimpleFact(args: {
  businessName: string;
  info: ChekelinInfo;
  refs: ProductRef[];
  templates: Template[];
  history: Pick<Message, "direction" | "body">[];
}): Promise<{ decision?: SimpleFactDecision; error?: string }> {
  const messages = toMessages(args.history);
  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return { error: "No hay un mensaje del cliente al cual responder." };
  }
  const system = [
    `Atiendes los mensajes de "${args.businessName}", un negocio hondureño. Una persona del equipo ya tiene esta conversación y todavía no responde. Solo puedes ayudar con datos simples.`,
    "Responde (simple_fact = true) SOLO si los últimos mensajes del cliente preguntan un dato simple —precio, colores, tallas, costo de envío o formas de pago— y la respuesta está en la información de abajo.",
    "Nunca tomes pedidos, confirmes pagos, des descuentos ni prometas fechas. Si preguntan eso, o cualquier otra cosa, pon simple_fact = false y reply vacío.",
    `reply: el dato, en 1 o 2 oraciones cortas, español natural de Honduras, sin despedirte y sin decir que alguien lo va a atender (eso lo agregamos nosotros). No te presentes. ${ADDRESS_FORM_RULE[args.info.address_form]}`,
    "",
    knowledge(args.info, args.refs, args.templates),
  ].join("\n");
  const { data, error } = await structuredCall<{ reply?: string; simple_fact?: boolean }>({
    system,
    messages,
    schema: SIMPLE_FACT_SCHEMA,
    maxTokens: 2000,
  });
  if (!data) return { error };
  return { decision: { reply: (data.reply ?? "").trim(), simpleFact: Boolean(data.simple_fact) } };
}

// ---------------------------------------------------------------------------
// Comentarios: a comment under one of the Tienda's posts (issue #43)
// ---------------------------------------------------------------------------

export type CommentDecision = {
  kind: "price" | "complaint" | "other";
  publicReply: string;
  privateReply: string;
  // The Catálogo product the comment asks about (P1, P2…), or null.
  productRef: string | null;
  teamSummary: string;
};

const COMMENT_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["price", "complaint", "other"] },
    public_reply: { type: "string", description: "Respuesta pública corta debajo del comentario. Vacía si kind = other." },
    private_reply: { type: "string", description: "Mensaje privado (DM) para quien comentó. Vacío si kind = other." },
    product_ref: { type: "string", description: "Producto del catálogo (P1, P2…) del que pregunta, o vacío si no se sabe." },
    team_summary: { type: "string", description: "Solo para el equipo: qué quiere o qué pasó, 1 oración." },
  },
  required: ["kind", "public_reply", "private_reply", "product_ref", "team_summary"],
  additionalProperties: false,
} as const;

export async function decideComment(args: {
  businessName: string;
  info: ChekelinInfo;
  refs: ProductRef[];
  managerName: string | null;
  platform: "instagram" | "facebook";
  postCaption: string | null;
  comment: string;
}): Promise<{ decision?: CommentDecision; error?: string }> {
  const manager = args.managerName ?? "la persona encargada";
  const network = args.platform === "instagram" ? "Instagram" : "Facebook";
  const system = [
    `Atiendes los comentarios públicos en las publicaciones de ${network} de "${args.businessName}", un negocio hondureño. Lees un comentario y decides qué hacer.`,
    "",
    "# kind",
    '- "price": pregunta precio, info, disponibilidad, tallas, colores, envíos, o muestra interés en comprar ("precio", "info", "¿cuánto?", "inbox", "lo quiero").',
    '- "complaint": un comentario negativo: queja, enojo, producto dañado, pedido que no llegó, mala atención, acusación de estafa.',
    '- "other": todo lo demás (elogios, emojis, etiquetar a un amigo, spam). No se responde.',
    "",
    "# public_reply (lo ve todo el mundo)",
    '- price: muy corto, sin precio ni datos, solo que le escribes por mensaje. Ejemplo: "¡Te escribimos por mensaje! 💬".',
    "- complaint: corto y amable, sin discutir, sin admitir culpas concretas ni prometer nada; reconoce y di que le escribes por mensaje para ayudarle personalmente. Sin emoji.",
    "",
    "# private_reply (mensaje privado, el único que se puede mandar hasta que la persona conteste)",
    "- Empieza diciendo que viste su comentario. Máximo 2 oraciones cortas, español natural de Honduras, sin frases de robot. No te presentes.",
    "- price: si sabes de qué producto habla (por la publicación o el comentario), di el nombre y el precio exacto del catálogo y pregunta algo para seguir la venta. Si no lo sabes, pregunta qué producto le interesó. Nunca inventes precios.",
    `- complaint: empatía de verdad, pide qué pasó y de qué pedido se trata, y di que ${manager} va a ver su caso personalmente y le responde lo antes posible. Nunca prometas reembolsos, descuentos, cambios ni fechas.`,
    `- ${ADDRESS_FORM_RULE[args.info.address_form]}`,
    "",
    knowledge(args.info, args.refs, []),
  ].join("\n");

  const content = [
    `Publicación: ${args.postCaption?.trim() ? args.postCaption.trim().slice(0, 1500) : "(sin texto)"}`,
    `Comentario: ${args.comment.slice(0, 1500)}`,
  ].join("\n\n");

  const { data, error } = await structuredCall<{
    kind?: CommentDecision["kind"];
    public_reply?: string;
    private_reply?: string;
    product_ref?: string;
    team_summary?: string;
  }>({ system, messages: [{ role: "user", content }], schema: COMMENT_SCHEMA, maxTokens: 2000 });
  if (!data) return { error };
  const ref = (data.product_ref ?? "").trim();
  return {
    decision: {
      kind: data.kind ?? "other",
      publicReply: (data.public_reply ?? "").trim(),
      privateReply: (data.private_reply ?? "").trim(),
      productRef: /^P\d+$/.test(ref) ? ref : null,
      teamSummary: (data.team_summary ?? "").trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// Sugerencias de chekelin: Plantillas from what the team keeps answering
// ---------------------------------------------------------------------------

export type ProposedTemplate = {
  question: string;
  times: number;
  name: string;
  category: TemplateCategory;
  body: string;
};

const SUGGESTIONS_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          times: { type: "integer" },
          name: { type: "string" },
          category: { type: "string", enum: ["precios", "pagos", "envios", "bienvenida", "seguimiento"] },
          body: { type: "string" },
        },
        required: ["question", "times", "name", "category", "body"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

// `pairs`: a customer's question and the reply a person on the team gave,
// from the past week. Returns Plantillas for questions answered 3+ times.
export async function proposeTemplates(args: {
  businessName: string;
  pairs: Array<{ question: string; answer: string }>;
  existing: string[];
}): Promise<{ suggestions?: ProposedTemplate[]; error?: string }> {
  const numbered = args.pairs
    .map((p, i) => `${i + 1}. Cliente: ${p.question}\n   Equipo: ${p.answer}`)
    .join("\n");

  const system = [
    `Ayudas al equipo de "${args.businessName}", un negocio hondureño, a crear Plantillas (respuestas rápidas).`,
    "Te damos preguntas de clientes de la última semana y lo que el equipo respondió.",
    "Agrupa las preguntas que piden lo mismo (aunque estén escritas distinto). Para cada grupo que el equipo respondió 3 veces o más, propone una Plantilla:",
    "- question: la pregunta típica, corta;",
    "- times: cuántas de las respuestas de la lista son de ese grupo (cuenta con cuidado, no inventes);",
    "- name: nombre corto de la Plantilla (ej. \"Costo de envío\");",
    "- category: precios, pagos, envios, bienvenida o seguimiento;",
    "- body: la mejor respuesta del equipo, mejorada solo un poco, sin datos de un cliente en particular (sin nombres ni direcciones). Si un dato cambia por producto usa {{producto}} o {{precio}}; si cambia por ciudad, {{ciudad}}.",
    "No propongas preguntas que ya cubre una Plantilla existente, ni saludos sin contenido. Si no hay ninguna, devuelve una lista vacía.",
    args.existing.length > 0 ? `\nPlantillas o sugerencias que ya existen:\n${args.existing.map((e) => `- ${e}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await structuredCall<{ suggestions?: ProposedTemplate[] }>({
    system,
    messages: [{ role: "user", content: numbered }],
    schema: SUGGESTIONS_SCHEMA,
    maxTokens: 8000,
  });
  if (!data) return { error: error ?? "chekelin no pudo preparar sugerencias." };
  return { suggestions: data.suggestions ?? [] };
}
