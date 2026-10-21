// chekelin's state and the routing words, as pure helpers shared by the
// server (webhooks, timers) and the Chat / Equipo screens. No server-only
// imports here.

// "Hasta que lo active" is stored as a date far in the future.
export const CHEKELIN_OFF_FOREVER = "9999-12-31T00:00:00.000Z";

export type ChekelinOffDuration = "1h" | "tomorrow" | "1w" | "forever";

export const CHEKELIN_OFF_OPTIONS: Array<{ id: ChekelinOffDuration; label: string }> = [
  { id: "1h", label: "1 hora" },
  { id: "tomorrow", label: "Hasta mañana" },
  { id: "1w", label: "1 semana" },
  { id: "forever", label: "Hasta que lo active" },
];

// Honduras is UTC-6 all year (no daylight saving time).
const HONDURAS_OFFSET_MS = -6 * 60 * 60 * 1000;

// When an "apagar" choice ends. "Hasta mañana" = tomorrow 7:00 a. m. in Honduras.
export function chekelinOffUntil(duration: ChekelinOffDuration, nowMs: number): string {
  if (duration === "1h") return new Date(nowMs + 60 * 60 * 1000).toISOString();
  if (duration === "1w") return new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (duration === "forever") return CHEKELIN_OFF_FOREVER;
  const local = new Date(nowMs + HONDURAS_OFFSET_MS);
  const tomorrow7 = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 7) - HONDURAS_OFFSET_MS;
  return new Date(tomorrow7).toISOString();
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// What chekelin knows about "now" (is the shop open right now? can I pick it
// up today?): "Ahora en Honduras: martes 20 de octubre, 9:40 p. m.". Built by
// hand so it never depends on the server's locale data.
export function hondurasTimeLine(nowMs: number): string {
  const local = new Date(nowMs + HONDURAS_OFFSET_MS);
  const hours = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const day = `${WEEKDAYS[local.getUTCDay()]} ${local.getUTCDate()} de ${MONTHS[local.getUTCMonth()]}`;
  return `Ahora en Honduras: ${day}, ${hour12}:${minutes} ${hours < 12 ? "a. m." : "p. m."}`;
}

export function isChekelinOff(offUntil: string | null | undefined, nowMs: number): boolean {
  if (!offUntil) return false;
  const until = new Date(offUntil).getTime();
  return Number.isFinite(until) && until > nowMs;
}

// "Apagado por 1 hora" style label for the switch.
export function chekelinOffLabel(offUntil: string, nowMs: number): string {
  const until = new Date(offUntil).getTime();
  if (until >= new Date("9000-01-01").getTime()) return "Apagado hasta que lo actives";
  const minutes = Math.max(1, Math.round((until - nowMs) / 60000));
  if (minutes < 60) return `Apagado ${minutes} min más`;
  const time = new Date(until).toLocaleString("es-HN", {
    timeZone: "America/Tegucigalpa",
    weekday: minutes > 24 * 60 ? "long" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
  return `Apagado hasta ${time}`;
}

// What chekelin is doing in one conversation:
// - "active": answers and sells (takes orders, sends payment details)
// - "silent": handed the chat to a person; only simple facts after 5 min
// - "complaint": an open Queja; fully silent until a person marks it resolved
// - "paused": paused by hand in this chat
// - "off": off in the Tienda, or not in the Negocio's plan
export type ChekelinChatState = "active" | "silent" | "complaint" | "paused" | "off";

export function chekelinChatState(input: {
  available: boolean;
  storeOffUntil: string | null | undefined;
  botEnabled: boolean;
  handedOffAt: string | null | undefined;
  complaintOpenAt?: string | null;
  nowMs: number;
}): ChekelinChatState {
  if (!input.available || isChekelinOff(input.storeOffUntil, input.nowMs)) return "off";
  if (input.complaintOpenAt) return "complaint";
  if (!input.botEnabled) return "paused";
  return input.handedOffAt ? "silent" : "active";
}

// chekelin "types" like a person before each message: 3 to 10 seconds,
// longer for longer replies (issue #40). `alreadyMs` is the time already
// spent (thinking the reply), so the customer never waits more than needed.
export function humanDelayMs(text: string, alreadyMs = 0): number {
  const target = Math.min(10_000, Math.max(3_000, 2_000 + text.length * 45));
  return Math.max(0, target - alreadyMs);
}

// The short pause before a second message (a long answer split in two).
export function secondMessageDelayMs(text: string): number {
  return Math.min(4_000, Math.max(1_500, text.length * 30));
}

// The name a customer sees ("Te paso con María"): the first word of the
// profile name. Null when the person never set a name (an email address
// would look odd to a customer).
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

// For the team: the profile name, or the email when there's none.
export function displayNameOf(person: { name?: string | null; email: string }): string {
  return person.name?.trim() || person.email;
}

// Customer-facing lines, in one place.
//
// The Traspaso. chekelin's own words (if any) go first; this line names who
// takes over. "confirm" = chekelin didn't have the information and said it
// would confirm it.
export function handoffLine(firstName: string | null, kind: "default" | "confirm" = "default"): string {
  const who = firstName ?? "alguien del equipo";
  return kind === "confirm"
    ? `${firstName ?? "Alguien del equipo"} te escribe en un momento para confirmarte 🙌`
    : `Te paso con ${who}, que te va a ayudar con esto. Te escribe en un momento 🙌`;
}

// After a person taps "Confirmar pago" on an order chekelin took.
export function paymentConfirmedLine(): string {
  return "¡Listo, ya confirmamos tu pago! Muchas gracias por tu compra 🙌 Te avisamos por aquí cuando tu pedido vaya en camino.";
}

export function waitNoticeLine(firstName: string | null): string {
  return firstName
    ? `Ya le avisamos a ${firstName}, te responde lo antes posible 🙌`
    : "Ya le avisamos al equipo, te responden lo antes posible 🙌";
}

export function simpleFactEnding(firstName: string | null): string {
  return `${firstName ?? "Alguien del equipo"} te atiende enseguida…`;
}

// chekeo moves on its own as chekelin sells: its first answer → Consulta, a
// price or a product photo → Cotización. Taking the order (→ Negociación,
// src/lib/orders.ts) and the confirmed payment (→ Ganado) move it further.
// Never moves a deal backwards; null = leave it where it is.
const STAGE_ORDER = ["nuevo", "consulta", "cotizacion"] as const;
// "L 450", "L450", "L. 450", "Lps 450", "450 lempiras". Not phone numbers or times.
const PRICE = /(?:\bL(?:ps?)?\.?\s?\d)|(?:\d\s?lempiras?\b)/i;

export function stageAfterChekelin(
  current: string | null,
  reply: { messages: string[]; productsSent: number },
): "consulta" | "cotizacion" | null {
  const at = STAGE_ORDER.indexOf((current ?? "nuevo") as (typeof STAGE_ORDER)[number]);
  if (at < 0) return null;
  const quoted = reply.productsSent > 0 || reply.messages.some((m) => PRICE.test(m));
  const target = quoted ? 2 : 1;
  return target > at ? STAGE_ORDER[target] as "consulta" | "cotizacion" : null;
}
