import Anthropic from "@anthropic-ai/sdk";
import { decideSeller, productRefs, type SellerDecision } from "@/lib/ai";
import { chekelinOutbox, planFor, type Knowledge, type LoadedConversation } from "@/lib/bot";
import { handoffLine, stageAfterChekelin } from "@/lib/chekelinState";
import { buildDemoData } from "@/lib/demoData";
import { formatLempiras } from "@/lib/format";
import { buildPaymentMessage, orderConcept, type OrderItem } from "@/lib/payments";
import type { Product } from "@/lib/types";
import { DEFAULT_NOW, type Scenario } from "./scenarios";

// Runs one scripted customer against the real model, the same way
// runSeller (src/lib/bot.ts) does: decideSeller → planFor → what goes out →
// chekeo stage. No database: the conversation lives in memory.

export const demo = buildDemoData(Date.parse("2026-10-20T20:00:00Z"));
// The demo products have no photos; give them some so "[tiene foto]" shows.
export const products: Product[] = demo.products.map((p, i) => ({ ...p, image_url: `https://example.com/p${i}.jpg` }));
const refs = productRefs(products);

export type Out = { text: string; kind: "text" | "product" | "location" | "handoff" | "payment"; product?: string };

export type TurnLog = {
  customer: string[];
  // null = chekelin stays silent (handed off or Queja).
  decision: SellerDecision | null;
  plan: string | null;
  outs: Out[];
  stage: string;
  error?: string;
};

export type Transcript = { scenario: Scenario; turns: TurnLog[]; stage: string; orderTotal: number | null };

export async function simulate(scenario: Scenario): Promise<Transcript> {
  const history: Array<{ direction: "in" | "out"; body: string }> = [];
  let stage = "nuevo";
  let silent = false;
  let replies = 0;
  let orderAt: string | null = null;
  let orderTotal: number | null = null;
  let pendingOrder: Knowledge["pendingOrder"] = null;

  if (scenario.pendingOrder) {
    const { concept, totalHnl } = scenario.pendingOrder;
    history.push({ direction: "in", body: "Quiero el ukelele, mándenmelo a Tegucigalpa" });
    history.push({ direction: "out", body: "¡Perfecto! Ahí te van los datos para pagar" });
    history.push({
      direction: "out",
      body: buildPaymentMessage({ concept, amountHnl: totalHnl, instructions: demo.chekelinInfo.payment_methods }),
    });
    pendingOrder = { id: "o-eval", concept, totalHnl, receiptSent: false };
    stage = "negociacion";
  }

  const turns: TurnLog[] = [];
  for (const turn of scenario.turns) {
    const customer = Array.isArray(turn) ? turn : [turn];
    for (const body of customer) history.push({ direction: "in", body });
    if (silent) {
      turns.push({ customer, decision: null, plan: null, outs: [], stage });
      continue;
    }

    const know: Knowledge = { info: demo.chekelinInfo, refs, templates: demo.templates, pendingOrder, location: demo.storeLocation };
    const conv = { chekelinReplies: replies, chekelinOrderAt: orderAt, stage } as unknown as LoadedConversation;
    const { decision, error } = await decideSeller({
      businessName: demo.storeName,
      info: know.info,
      refs: know.refs,
      templates: know.templates,
      managerName: "Sofía",
      pendingOrder,
      location: know.location,
      history,
      nowMs: Date.parse(scenario.now ?? DEFAULT_NOW),
    });
    if (!decision) {
      turns.push({ customer, decision: null, plan: null, outs: [], stage, error });
      continue;
    }

    const plan = planFor(decision, conv, know);
    const outbox = chekelinOutbox(decision, plan, know, { channelType: scenario.channel ?? "whatsapp", storeName: demo.storeName });
    const texts = outbox.filter((o) => o.kind === "text").map((o) => o.text);
    const outs: Out[] = outbox.map((o) =>
      o.kind === "product"
        ? { text: o.text, kind: "product", product: o.text.split(" — ")[0] }
        : o.kind === "location"
          ? { text: o.location ? `[pin de mapa] ${o.text}` : o.text, kind: "location" }
          : { text: o.text, kind: "text" },
    );

    switch (plan.kind) {
      case "handoff":
        outs.push({ text: handoffLine("Sofía", plan.lineKind), kind: "handoff" });
        silent = true;
        break;
      case "complaint":
        silent = true;
        break;
      case "order": {
        const items: OrderItem[] = plan.order.items.map((i) => ({
          name: i.product,
          details: i.details || undefined,
          quantity: i.quantity,
          price_hnl: i.unit_price_hnl,
        }));
        outs.push({
          text: buildPaymentMessage({
            concept: orderConcept(items, plan.order.shipping_hnl),
            amountHnl: plan.order.total_hnl,
            instructions: know.info.payment_methods,
          }),
          kind: "payment",
        });
        orderTotal = plan.order.total_hnl;
        orderAt = "now";
        pendingOrder = { id: "o-eval", concept: orderConcept(items, plan.order.shipping_hnl), totalHnl: plan.order.total_hnl, receiptSent: false };
        if (["nuevo", "consulta", "cotizacion"].includes(stage)) stage = "negociacion";
        break;
      }
      case "receipt":
        if (pendingOrder) pendingOrder = { ...pendingOrder, receiptSent: true };
        break;
    }
    if (plan.kind === "reply" || plan.kind === "ask_team") {
      const next = stageAfterChekelin(stage, { messages: texts, productsSent: outs.filter((o) => o.kind === "product").length });
      if (next) stage = next;
    }
    replies += Math.max(1, outs.filter((o) => o.kind === "text").length);
    for (const o of outs) history.push({ direction: "out", body: o.text });
    turns.push({ customer, decision, plan: plan.kind, outs, stage });
  }
  return { scenario, turns, stage, orderTotal };
}

// ---------------------------------------------------------------------------
// Deterministic checks
// ---------------------------------------------------------------------------

export type Check = { id: string; pass: boolean; note: string };

// Every amount chekelin may say: catalog prices (×1–5), shipping, and sums of
// up to two products plus shipping.
function allowedAmounts(): Set<number> {
  const prices = products.map((p) => p.price_hnl);
  const shipping = [0, 80, 120, 150];
  const ok = new Set<number>([...shipping, 7, 12, 1, 2, 3, 9, 5]);
  for (const p of prices) for (let k = 1; k <= 5; k++) for (const s of shipping) ok.add(k * p + s);
  for (const a of prices) for (const b of prices) for (let k = 1; k <= 3; k++) for (const s of shipping) ok.add(a + k * b + s);
  return ok;
}
const ALLOWED = allowedAmounts();
const AMOUNT = /\bL(?:ps?)?\.?\s?(\d{1,3}(?:,\d{3})+|\d+)|(\d{1,3}(?:,\d{3})+|\d+)\s?lempiras?/gi;

export function deterministicChecks(t: Transcript): Check[] {
  const { expect } = t.scenario;
  const decided = t.turns.filter((x) => x.decision);
  const last = decided.at(-1);
  const said = t.turns.flatMap((x) => x.outs.filter((o) => o.kind === "text").map((o) => o.text));
  const all = said.join("\n");
  // What the customer received, product cards and location included.
  const received = t.turns.flatMap((x) => x.outs.filter((o) => o.kind !== "payment").map((o) => o.text)).join("\n");
  const checks: Check[] = [];

  checks.push({
    id: "sin_errores",
    pass: t.turns.every((x) => !x.error),
    note: t.turns.map((x) => x.error).filter(Boolean).join("; "),
  });
  checks.push({
    id: "max_2_mensajes",
    pass: decided.every((x) => (x.decision?.messages.length ?? 0) <= 2),
    note: decided.map((x) => x.decision?.messages.length).join(","),
  });

  const bad: string[] = [];
  for (const m of all.matchAll(AMOUNT)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
    if (!ALLOWED.has(n)) bad.push(m[0]);
  }
  checks.push({ id: "precios_validos", pass: bad.length === 0, note: bad.join(", ") });

  if (expect.finalAction) {
    const want = [expect.finalAction].flat();
    checks.push({
      id: "accion_final",
      pass: Boolean(last?.decision && want.includes(last.decision.action)),
      note: `quería ${want.join("|")}, fue ${last?.decision?.action ?? "—"}`,
    });
  }
  if (expect.handoffReason) {
    const want = [expect.handoffReason].flat();
    checks.push({
      id: "motivo_traspaso",
      pass: Boolean(last?.decision && want.includes(last.decision.handoffReason)),
      note: `quería ${want.join("|")}, fue ${last?.decision?.handoffReason ?? "—"}`,
    });
  }
  if (expect.neverAction) {
    const hit = decided.filter((x) => expect.neverAction?.includes(x.decision!.action));
    checks.push({ id: "accion_prohibida", pass: hit.length === 0, note: hit.map((x) => x.decision?.action).join(",") });
  }
  for (const re of expect.mentions ?? []) {
    checks.push({ id: `menciona ${re.source}`, pass: re.test(received), note: "" });
  }
  for (const re of expect.forbid ?? []) {
    const m = all.match(re);
    checks.push({ id: `no_dice ${re.source}`, pass: !m, note: m?.[0] ?? "" });
  }
  if (expect.total !== undefined) {
    checks.push({
      id: "total_correcto",
      pass: t.orderTotal === expect.total,
      note: `quería ${formatLempiras(expect.total)}, fue ${t.orderTotal === null ? "sin pedido" : formatLempiras(t.orderTotal)}`,
    });
  }
  if (expect.stage) {
    checks.push({ id: "etapa_chekeo", pass: t.stage === expect.stage, note: `quería ${expect.stage}, fue ${t.stage}` });
  }
  for (const name of expect.productsSent ?? []) {
    const sent = t.turns.some((x) => x.outs.some((o) => o.kind === "product" && o.product === name));
    checks.push({ id: `foto ${name}`, pass: sent, note: "" });
  }
  if (expect.locationSent) {
    const sent = t.turns.some((x) => x.outs.some((o) => o.kind === "location"));
    checks.push({ id: "ubicacion_enviada", pass: sent, note: "" });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// LLM judge (strict rubric)
// ---------------------------------------------------------------------------

const JUDGE_MODEL = "claude-opus-5-5";

const CRITERIA = [
  ["accion_correcta", "Hizo lo que pide el objetivo del escenario (responder, traspaso, queja, pedido, comprobante) en el momento correcto."],
  ["sin_inventar", "No inventó precios, productos, costos, plazos, horarios, políticas ni datos que no estén en la información del negocio. Tampoco negó algo que la información no dice."],
  ["responde_todo", "Contestó todas las preguntas del cliente en ese turno (o dijo que confirma lo que no sabe)."],
  ["avanza_venta", "Mueve la venta: después de contestar invita al siguiente paso (sin presionar) cuando tiene sentido. No aplica (pass) en quejas o traspasos."],
  ["tono_humano", "Suena como una vendedora hondureña por WhatsApp: corto, cálido, natural, sin frases de robot ni de call center, sin repetir el saludo, sin exceso de emojis."],
  ["trato_consistente", "Usa el trato del cliente (vos, tú o usted). Cambiar una vez para seguir al cliente cuando este muestra su trato está bien; mezclar formas dentro de un mismo mensaje, o hablarle distinto de como él habla, es fail."],
  ["no_revela_ia", "Nunca dice que es bot/IA/asistente si no se lo preguntan. Si se lo preguntan directo, responde honesto en una frase (no dice que es persona) y sigue ayudando."],
] as const;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: CRITERIA.map(([id]) => id) },
          pass: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["id", "pass", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["criteria"],
  additionalProperties: false,
} as const;

export function transcriptText(t: Transcript): string {
  const lines: string[] = [];
  if (t.scenario.pendingOrder) lines.push(`(Antes: pedido esperando pago: ${t.scenario.pendingOrder.concept}, ${formatLempiras(t.scenario.pendingOrder.totalHnl)})`);
  t.turns.forEach((x, i) => {
    for (const c of x.customer) lines.push(`CLIENTE: ${c}`);
    if (x.error) lines.push(`[error: ${x.error}]`);
    if (!x.decision) {
      lines.push("[chekelin en silencio: el chat lo tiene una persona]");
      return;
    }
    for (const o of x.outs) {
      const tag = o.kind === "text" ? "VENDEDORA" : `SISTEMA (${o.kind})`;
      lines.push(`${tag}: ${o.text}`);
    }
    lines.push(
      `   [turno ${i + 1}: action=${x.decision.action}${x.decision.action === "handoff" ? `/${x.decision.handoffReason}` : ""}, plan=${x.plan}, etapa=${x.stage}${x.decision.action === "order_ready" ? `, total=${x.decision.order.total_hnl}` : ""}; nota equipo: ${x.decision.teamSummary}]`,
    );
  });
  return lines.join("\n");
}

function businessFacts(): string {
  const i = demo.chekelinInfo;
  return [
    `Negocio: ${demo.storeName}`,
    `Formas de pago: ${i.payment_methods}`,
    `Envíos: ${i.shipping}`,
    `Horario de entregas: ${i.delivery_hours}`,
    `Cambios: ${i.returns_policy}`,
    `FAQ: ${i.faq}`,
    `Ubicación: ${demo.storeLocation.address} (el sistema puede mandar el pin del mapa)`,
    "Encargada de la tienda (Gerente): Sofía",
    "Catálogo:",
    ...products.map((p) => `- ${p.name}: ${formatLempiras(p.price_hnl)} (${p.description})`),
  ].join("\n");
}

let judgeClient: Anthropic | null = null;

export async function judge(t: Transcript): Promise<Check[]> {
  judgeClient ??= new Anthropic();
  const system = [
    "Eres un evaluador estricto de una vendedora automática que atiende por WhatsApp a clientes de una tienda hondureña.",
    "Las líneas SISTEMA son mensajes automáticos (fotos de producto con precio, ubicación, datos de pago, aviso de traspaso): no los evalúes como redacción de la vendedora, pero sí cuentan como información que el cliente recibió.",
    "Evalúa cada criterio con pass true/false. Sé estricto: un solo dato inventado, una pregunta sin contestar o una mezcla de trato es fail. Si un criterio no aplica, pass = true. La nota explica en una frase el porqué (cita la frase problemática si falla).",
    "",
    "Criterios:",
    ...CRITERIA.map(([id, text]) => `- ${id}: ${text}`),
    "",
    "Información del negocio (lo único que la vendedora sabe):",
    businessFacts(),
  ].join("\n");
  const content = [
    `Escenario: ${t.scenario.title}`,
    `Objetivo: ${t.scenario.goal}`,
    `Hora local del cliente: ${t.scenario.now ?? DEFAULT_NOW}`,
    "",
    "Conversación:",
    transcriptText(t),
  ].join("\n");
  try {
    const response = await judgeClient.beta.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    });
    const text = response.content.find((b) => b.type === "text")?.text;
    if (response.stop_reason !== "end_turn" || !text) {
      return [{ id: "juez", pass: false, note: `juez sin respuesta (${response.stop_reason})` }];
    }
    const parsed = JSON.parse(text) as { criteria: Array<{ id: string; pass: boolean; note: string }> };
    return parsed.criteria.map((c) => ({ id: `juez:${c.id}`, pass: c.pass, note: c.note }));
  } catch (error) {
    return [{ id: "juez", pass: false, note: error instanceof Error ? error.message : String(error) }];
  }
}
