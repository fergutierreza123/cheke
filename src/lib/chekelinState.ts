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
// - "active": answers the customer (first responder)
// - "silent": handed the chat to a person; only simple facts after 5 min
// - "paused": paused by hand in this chat
// - "off": off in the Tienda, or not in the Negocio's plan
export type ChekelinChatState = "active" | "silent" | "paused" | "off";

export function chekelinChatState(input: {
  available: boolean;
  storeOffUntil: string | null | undefined;
  botEnabled: boolean;
  handedOffAt: string | null | undefined;
  nowMs: number;
}): ChekelinChatState {
  if (!input.available || isChekelinOff(input.storeOffUntil, input.nowMs)) return "off";
  if (!input.botEnabled) return "paused";
  return input.handedOffAt ? "silent" : "active";
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
export function handoffLine(firstName: string | null): string {
  return `Te paso con ${firstName ?? "alguien del equipo"}, que te va a ayudar con esto. Te escribe en un momento 🙌`;
}

export function waitNoticeLine(firstName: string | null): string {
  return firstName
    ? `Ya le avisamos a ${firstName}, te responde lo antes posible 🙌`
    : "Ya le avisamos al equipo, te responden lo antes posible 🙌";
}

export function simpleFactEnding(firstName: string | null): string {
  return `${firstName ?? "Alguien del equipo"} te atiende enseguida…`;
}

export function introLine(businessName: string): string {
  return `Hola, soy chekelin, el asistente de ${businessName}.`;
}
