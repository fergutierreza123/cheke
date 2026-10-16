import Anthropic from "@anthropic-ai/sdk";
import type { Message, Product, Template, TemplateCategory } from "@/lib/types";
import { formatLempiras } from "@/lib/format";

// Chekelin: the AI assistant that is the first responder in a conversation
// until it hands it to a person (Traspaso), and that later proposes
// Plantillas from what the team keeps answering. Server-only — never
// imported from client components.
//
// The model stays Claude Haiku 4.5 (changing it is a separate decision,
// issue #10). Every call uses structured output (a JSON schema), so the
// handoff decision comes back as data, not as text to interpret.

const MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

function businessInfo(products: Product[], templates: Template[]): string {
  const catalog = products
    .filter((p) => p.visible)
    .slice(0, 25)
    .map((p) => {
      const line = `- ${p.name}${p.category ? ` (${p.category})` : ""}: ${formatLempiras(p.price_hnl)}`;
      // The description field is where colors, sizes, materials, etc. live
      // today (there's no dedicated variant schema yet).
      return p.description ? `${line}\n  Detalles: ${p.description}` : line;
    })
    .join("\n");

  const templateNotes = templates
    .slice(0, 15)
    .map((t) => `- [${t.category}] ${t.body}`)
    .join("\n");

  return [
    catalog ? `Catálogo disponible:\n${catalog}` : "Todavía no hay catálogo de productos cargado.",
    templateNotes
      ? `\nRespuestas de referencia del negocio (envíos, pagos, precios…; úsalas como fuente de información y de tono):\n${templateNotes}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Why chekelin passed the chat to a person.
export type HandoffReason = "pide_persona" | "quiere_comprar" | "falta_info" | "molesto" | "ninguna";

export type ChekelinDecision = {
  // What chekelin says to the customer (empty when it hands off or, in
  // simple-facts mode, when it shouldn't answer).
  reply: string;
  handoff: boolean;
  reason: HandoffReason;
  // For the team only: what the customer wants.
  summary: string;
  // The customer's latest question is only a simple fact (price,
  // colors, sizes, shipping cost, payment methods) answerable from the info.
  simpleFact: boolean;
};

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Mensaje para el cliente. Vacío si handoff es true." },
    handoff: { type: "boolean" },
    reason: { type: "string", enum: ["pide_persona", "quiere_comprar", "falta_info", "molesto", "ninguna"] },
    summary: { type: "string", description: "Para el equipo: qué quiere el cliente, en 1 o 2 oraciones." },
    simple_fact: { type: "boolean" },
  },
  required: ["reply", "handoff", "reason", "summary", "simple_fact"],
  additionalProperties: false,
} as const;

function firstResponderPrompt(businessName: string, info: string, isFirstReply: boolean): string {
  return [
    `Eres "chekelin", el asistente virtual de "${businessName}", un negocio hondureño que vende por WhatsApp, Instagram y Facebook.`,
    "Eres solo el primero en responder: contestas dudas sencillas mientras una persona del equipo toma la conversación.",
    "Usa SOLO la información de abajo. Nunca inventes precios, productos ni fechas.",
    "",
    "Pon handoff = true (y reply vacío) en cuanto pase cualquiera de estas cosas:",
    '- el cliente pide hablar con una persona ("reason": "pide_persona");',
    '- el cliente quiere comprar, pedir, apartar, pagar o confirmar algo ("quiere_comprar");',
    '- no tienes la información para responder bien ("falta_info");',
    '- el cliente está molesto, impaciente o se queja ("molesto").',
    'Si no, handoff = false, reason = "ninguna", y responde en reply.',
    "",
    "Cómo escribir reply: español de Honduras, cercano, 1 a 3 oraciones cortas, como por WhatsApp, máximo un emoji.",
    isFirstReply
      ? `Es tu primer mensaje en esta conversación: empieza con "Hola, soy chekelin, el asistente de ${businessName}." y luego responde.`
      : "Ya te presentaste antes: no te vuelvas a presentar.",
    "",
    "summary es solo para el equipo (el cliente nunca lo ve): qué quiere el cliente (productos, cantidades, colores, tallas, ciudad…), en 1 o 2 oraciones. Llénalo siempre.",
    "simple_fact = true si la última pregunta del cliente es solo un dato simple: precio, colores, tallas, costo de envío o formas de pago.",
    "",
    info,
  ].join("\n");
}

function simpleFactsPrompt(businessName: string, info: string): string {
  return [
    `Eres "chekelin", el asistente virtual de "${businessName}", un negocio hondureño.`,
    "Una persona del equipo ya tiene esta conversación y todavía no responde. Solo puedes ayudar con datos simples.",
    "Responde (simple_fact = true) SOLO si los últimos mensajes del cliente preguntan un dato simple —precio, colores, tallas, costo de envío o formas de pago— y la respuesta está en la información de abajo.",
    "Nunca tomes pedidos, confirmes pagos, des descuentos ni prometas fechas o tiempos de entrega. Si preguntan algo de eso, o cualquier otra cosa, pon simple_fact = false y reply vacío.",
    "reply: el dato, en 1 o 2 oraciones cortas, español de Honduras, sin despedirte y sin decir que alguien lo va a atender (eso lo agregamos nosotros). No te presentes.",
    'Pon siempre handoff = false y reason = "ninguna". summary: qué quiere el cliente, en una oración, para el equipo.',
    "",
    info,
  ].join("\n");
}

export async function decideChekelin(args: {
  mode: "first_responder" | "simple_facts";
  businessName: string;
  products: Product[];
  templates: Template[];
  history: Pick<Message, "direction" | "body">[];
  isFirstReply?: boolean;
}): Promise<{ decision?: ChekelinDecision; error?: string }> {
  const anthropic = getClient();
  if (!anthropic) return { error: "Falta configurar ANTHROPIC_API_KEY en el servidor." };

  const messages: Anthropic.MessageParam[] = args.history
    .filter((m) => m.body)
    .slice(-12)
    .map((m) => ({
      role: m.direction === "in" ? "user" : "assistant",
      content: m.body as string,
    }));
  // The API needs the conversation to start and end with the customer.
  while (messages.length > 0 && messages[0].role !== "user") messages.shift();
  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return { error: "No hay un mensaje del cliente al cual responder." };
  }

  const info = businessInfo(args.products, args.templates);
  const system =
    args.mode === "first_responder"
      ? firstResponderPrompt(args.businessName, info, Boolean(args.isFirstReply))
      : simpleFactsPrompt(args.businessName, info);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system,
      messages,
      output_config: { format: { type: "json_schema", schema: DECISION_SCHEMA } },
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return { error: "chekelin no pudo decidir una respuesta." };
    }
    const text = response.content.find((block) => block.type === "text")?.text;
    if (!text) return { error: "chekelin no generó una respuesta." };
    const raw = JSON.parse(text) as {
      reply: string;
      handoff: boolean;
      reason: HandoffReason;
      summary: string;
      simple_fact: boolean;
    };
    return {
      decision: {
        reply: (raw.reply ?? "").trim(),
        handoff: Boolean(raw.handoff),
        reason: raw.reason ?? "ninguna",
        summary: (raw.summary ?? "").trim(),
        simpleFact: Boolean(raw.simple_fact),
      },
    };
  } catch (error) {
    console.error("chekelin ai error", error);
    return { error: error instanceof Error ? error.message : "Error al generar la respuesta de chekelin." };
  }
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
  const anthropic = getClient();
  if (!anthropic) return { error: "Falta configurar ANTHROPIC_API_KEY en el servidor." };

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

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: numbered }],
      output_config: { format: { type: "json_schema", schema: SUGGESTIONS_SCHEMA } },
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return { error: "chekelin no pudo preparar sugerencias." };
    }
    const text = response.content.find((block) => block.type === "text")?.text;
    if (!text) return { suggestions: [] };
    const raw = JSON.parse(text) as { suggestions?: ProposedTemplate[] };
    return { suggestions: raw.suggestions ?? [] };
  } catch (error) {
    console.error("chekelin suggestions error", error);
    return { error: error instanceof Error ? error.message : "Error al preparar sugerencias." };
  }
}
