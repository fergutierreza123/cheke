// The Plan a Negocio pays for (see GLOSSARY.md), as stored in
// businesses.plan. Safe to show anywhere, including the phone app: naming
// the current plan is allowed by both stores. Anything that SELLS a plan
// (prices, "mejorar plan", payment methods) must be wrapped in
// <HideInNativeApp> from src/components/NativeApp.tsx.
const PLAN_LABEL: Record<string, string> = {
  free: "Gratis",
  trial: "Prueba",
  basic: "Básico",
  pro: "Pro",
  cheke: "cheKe",
  plus: "cheKe Plus",
};

// Values that mean the Negocio's plan has ended. Nothing writes these yet;
// billing will, and the UI already reacts.
const LAPSED_PLANS = new Set(["lapsed", "expired", "cancelled", "inactive"]);

export function planLabel(plan: string): string {
  return PLAN_LABEL[plan] ?? plan;
}

export function isPlanActive(plan: string): boolean {
  return !LAPSED_PLANS.has(plan);
}

// Neutral wording for a lapsed plan: no price, no instructions, no link, so
// it is also fine inside the store apps (Apple 3.1.3(f)).
export const PLAN_LAPSED_MESSAGE = "Tu plan no está activo.";

// The one place the plan's Tienda limit will plug in (issue #9). Until
// plans are priced, any Negocio can open as many Tiendas as it needs.
// Archived Tiendas don't count.
export function canOpenAnotherStore(plan: string, openStoreCount: number): boolean {
  void plan;
  void openStoreCount;
  return true;
}

// chekelin (the AI first responder, its simple-facts answers and the weekly
// Sugerencias) is part of cheKe Plus and cheKe Pro. The one place the plan
// check will plug in (issue #9); until plans are priced every Negocio has it.
// Routing to people, Ausente and the timers work on every plan; without
// chekelin the 5-minute "ya le avisamos" goes out as a plain automatic message.
// TODO(#9): return false for the cheKe plan once plans are priced.
export function canUseChekelin(plan: string): boolean {
  void plan;
  return true;
}

// ---------------------------------------------------------------------------
// chekelin's monthly allowance (issue #9, founder decision 2026-10-20)
// ---------------------------------------------------------------------------
//
// Each Plan includes a number of "conversaciones atendidas por chekelin" per
// calendar month in Honduras: a Conversación counts once in a month when
// chekelin sent it at least one message that month (Chat's modo prueba
// doesn't count). It is a LIMIT, not pay-per-use. When a Negocio reaches it,
// chekelin stops taking NEW conversations that month: they go quietly to the
// team, like when chekelin errors. Conversations chekelin already attended
// this month keep going, so no sale is cut in half. The Dueño gets one
// notice. It starts again on the 1st (Honduras time).
//
// PLACEHOLDER numbers: the founder sets the real ones. Proposed in the PR so
// chekelin's model cost stays under ~15% of the plan price at about US$0.10
// per conversation; check them with `npm run report:chekelin-cost` after a
// few weeks of real usage.
//   cheke      L790    → 40 conversations a month
//   cheke Plus L1,590  → 80
//   cheke Pro  L3,990  → 200, + 50 per extra Tienda (L890 each)
// A plan not listed here (pilots, "trial", "free", old values) has no limit.
export const CHEKELIN_MONTHLY_CONVERSATIONS: Record<"cheke" | "plus" | "pro", { included: number; perExtraStore: number }> = {
  cheke: { included: 40, perExtraStore: 0 }, // PLACEHOLDER: founder sets it
  plus: { included: 80, perExtraStore: 0 }, // PLACEHOLDER: founder sets it
  pro: { included: 200, perExtraStore: 50 }, // PLACEHOLDER: founder sets it
};

// From 80% used, the meter shows a calm warning.
export const CHEKELIN_WARNING_SHARE = 0.8;

// Honduras is UTC-6 all year (no daylight saving time).
const HONDURAS_OFFSET_MS = -6 * 60 * 60 * 1000;
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// The chekelin month a moment belongs to, as its first day ("2026-10-01"),
// in Honduras time.
export function chekelinMonth(nowMs: number): string {
  const local = new Date(nowMs + HONDURAS_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// When the count starts again: "1 de noviembre".
export function nextChekelinMonthLabel(nowMs: number): string {
  const local = new Date(nowMs + HONDURAS_OFFSET_MS);
  return `1 de ${MONTH_NAMES[(local.getUTCMonth() + 1) % 12]}`;
}

// How many conversations chekelin may attend this month, or null when the
// Negocio's plan has no limit. `extra` is a pack the founder recorded by hand
// (businesses.chekelin_extra) for the month in `extraMonth`.
export function chekelinAllowance(input: {
  plan: string;
  openStoreCount: number;
  month: string;
  extra?: number | null;
  extraMonth?: string | null;
}): number | null {
  const limits = CHEKELIN_MONTHLY_CONVERSATIONS[input.plan as keyof typeof CHEKELIN_MONTHLY_CONVERSATIONS];
  if (!limits) return null;
  const extraStores = Math.max(0, input.openStoreCount - 1);
  const pack = input.extraMonth && input.extraMonth.slice(0, 10) === input.month ? Math.max(0, input.extra ?? 0) : 0;
  return limits.included + extraStores * limits.perExtraStore + pack;
}

export type ChekelinMeter = {
  used: number;
  allowance: number | null;
  level: "ok" | "warning" | "over";
  // "chekelin: 132 de 300 conversaciones este mes"
  text: string;
  // How full the bar is (0–100); null without a limit.
  percent: number | null;
};

export function chekelinMeter(used: number, allowance: number | null): ChekelinMeter {
  if (allowance === null) {
    const noun = used === 1 ? "conversación" : "conversaciones";
    return { used, allowance, level: "ok", text: `chekelin: ${used} ${noun} este mes`, percent: null };
  }
  const level = used >= allowance ? "over" : used >= allowance * CHEKELIN_WARNING_SHARE ? "warning" : "ok";
  const percent = allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 100;
  return { used, allowance, level, text: `chekelin: ${used} de ${allowance} conversaciones este mes`, percent };
}
