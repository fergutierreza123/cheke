import Anthropic from "@anthropic-ai/sdk";
import type { Message, Product, Template } from "@/lib/types";
import { formatLempiras } from "@/lib/format";

// Chekelin: the AI assistant that answers a customer's first messages
// before a human agent picks up the conversation. Server-only — never
// imported from client components.

const MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

function buildSystemPrompt(businessName: string, products: Product[], templates: Template[]): string {
  const catalog = products
    .filter((p) => p.visible)
    .slice(0, 25)
    .map((p) => `- ${p.name}: ${formatLempiras(p.price_hnl)}${p.stock <= 0 ? " (agotado)" : ""}`)
    .join("\n");

  const templateNotes = templates
    .slice(0, 10)
    .map((t) => `- [${t.category}] ${t.body}`)
    .join("\n");

  return [
    `Eres "chekelin", el asistente virtual de WhatsApp de "${businessName}", un negocio hondureño.`,
    "Respondes el primer mensaje de un cliente nuevo de forma breve, amable y en español de Honduras.",
    "Tu trabajo es responder dudas (precios, disponibilidad, envíos) usando SOLO la información que se te da abajo, y ayudar a entender qué necesita el cliente.",
    "Si no sabes algo o no está en la información dada, dilo honestamente y ofrece que un agente humano lo confirme pronto. Nunca inventes precios ni productos que no estén en el catálogo.",
    "Responde en 1-3 oraciones cortas, tono cercano, sin emojis excesivos (máximo uno), como se escribe por WhatsApp.",
    "",
    catalog ? `Catálogo disponible:\n${catalog}` : "Todavía no hay catálogo de productos cargado.",
    templateNotes ? `\nRespuestas de referencia del negocio (úsalas como guía de tono e información, no las copies literalmente si no aplican):\n${templateNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateChekelinReply(args: {
  businessName: string;
  products: Product[];
  templates: Template[];
  history: Pick<Message, "direction" | "body">[];
}): Promise<{ reply?: string; error?: string }> {
  const anthropic = getClient();
  if (!anthropic) return { error: "Falta configurar ANTHROPIC_API_KEY en el servidor." };

  const messages = args.history
    .filter((m) => m.body)
    .slice(-12)
    .map((m) => ({
      role: (m.direction === "in" ? "user" : "assistant") as "user" | "assistant",
      content: m.body as string,
    }));

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return { error: "No hay un mensaje del cliente al cual responder." };
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: buildSystemPrompt(args.businessName, args.products, args.templates),
      messages,
    });
    const text = response.content.find((block) => block.type === "text")?.text?.trim();
    if (!text) return { error: "chekelin no generó una respuesta." };
    return { reply: text };
  } catch (error) {
    console.error("chekelin ai error", error);
    return { error: error instanceof Error ? error.message : "Error al generar la respuesta de chekelin." };
  }
}
