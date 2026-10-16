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
