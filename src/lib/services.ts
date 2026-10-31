// Tiendas that give services (salons, clinics, gyms…), issue #117: the
// Tipo de negocio, the Horario de atención and a Servicio's duration. Pure
// helpers, safe in the browser. Stored in store_chekelin_info and products
// (migration 0049).

export type BusinessKind = "products" | "services";

// One day: open → close, "HH:MM" in Honduras time. null = cerrado.
export type DayHours = { open: string; close: string };
// Seven days, Sunday first (like Date.getUTCDay()).
export type OpeningHours = Array<DayHours | null>;

export const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
// How the week is read and shown: Monday first.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// The durations the form offers (minutes).
export const SERVICE_DURATIONS = [15, 30, 45, 60, 90, 120];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// "09:30" → 570.
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// 570 → "9:30 a. m.".
export function hour12(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = String(minutes % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "a. m." : "p. m."}`;
}

// What the browser sent → a clean week, null (no horario yet) or the
// first problem in Spanish. The database checks the same shape again.
export function normalizeOpeningHours(raw: unknown): { hours: OpeningHours | null; error?: string } {
  if (raw === null || raw === undefined) return { hours: null };
  if (!Array.isArray(raw) || raw.length !== 7) return { hours: null, error: "El horario de atención no es válido." };
  const hours: OpeningHours = [];
  for (const [i, day] of raw.entries()) {
    if (day === null) {
      hours.push(null);
      continue;
    }
    const { open, close } = (day ?? {}) as Partial<DayHours>;
    if (typeof open !== "string" || typeof close !== "string" || !TIME.test(open) || !TIME.test(close)) {
      return { hours: null, error: `Revisa el horario del ${WEEKDAY_NAMES[i]}: escribe la hora de abrir y de cerrar.` };
    }
    if (minutesOf(close) <= minutesOf(open)) {
      return { hours: null, error: `Revisa el horario del ${WEEKDAY_NAMES[i]}: la hora de cerrar debe ser después de la de abrir.` };
    }
    hours.push({ open, close });
  }
  return { hours };
}

// For chekelin: "lunes 9:00 a. m. a 5:00 p. m.; …; domingo cerrado".
export function openingHoursText(hours: OpeningHours | null | undefined): string {
  if (!hours) return "";
  return WEEK_ORDER.map((d) => {
    const day = hours[d];
    return `${WEEKDAY_NAMES[d]} ${day ? `${hour12(minutesOf(day.open))} a ${hour12(minutesOf(day.close))}` : "cerrado"}`;
  }).join("; ");
}
