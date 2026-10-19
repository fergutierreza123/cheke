import type { ChannelType, ConversationStage, TemplateCategory } from "@/lib/types";

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// We don't collect display names anywhere (no profiles table) — team
// members are identified by email, so their "initials" come from that.
// People who log in by SMS may have only a number ("+504 9999-9999"; see
// business_members in migration 0020): use its last two digits.
export function initialsFromEmail(email: string | null): string {
  if (!email) return "?";
  if (!email.includes("@") && email.startsWith("+")) return email.replace(/\D/g, "").slice(-2);
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

// Built by hand instead of toLocaleTimeString("es-HN", ...) — that locale
// inserts a narrow no-break space inside "p. m." that several fonts (ours
// included) render as an oversized, uneven gap. "p.m."/"a.m." with no
// internal space reads consistently everywhere.
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours24 < 12 ? "a.m." : "p.m.";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} día${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months === 1 ? "" : "es"}`;
}

export function primaryChannel(c: {
  phone: string | null;
  ig_handle: string | null;
  fb_id: string | null;
}): ChannelType | null {
  if (c.phone) return "whatsapp";
  if (c.ig_handle) return "instagram";
  if (c.fb_id) return "facebook";
  return null;
}

export const CHANNEL_META: Record<ChannelType, { label: string; color: string }> = {
  whatsapp: { label: "WhatsApp", color: "#25D366" },
  instagram: { label: "Instagram", color: "#C1387B" },
  facebook: { label: "Facebook", color: "#1877F2" },
};

// Matches the stage list from the approved design (design/Inbox.html,
// design/Contacts.html) — the Chekeo kanban board (later phase) will use
// the same stages, reading/writing this same column.
export const STAGE_META: Record<ConversationStage, { label: string; color: string }> = {
  nuevo: { label: "Nuevo mensaje", color: "#5B6584" },
  consulta: { label: "Consulta de producto", color: "#0043F8" },
  cotizacion: { label: "Cotización enviada", color: "#002997" },
  negociacion: { label: "Negociación", color: "#001037" },
  ganado: { label: "Vendido", color: "#52EBBB" },
  perdido: { label: "Perdido", color: "#DC2626" },
};

export const STAGE_ORDER: ConversationStage[] = [
  "nuevo",
  "consulta",
  "cotizacion",
  "negociacion",
  "ganado",
  "perdido",
];

export const TEMPLATE_CATEGORY_META: Record<TemplateCategory, { label: string; color: string }> = {
  precios: { label: "Precios", color: "#0043F8" },
  pagos: { label: "Pagos", color: "#52EBBB" },
  envios: { label: "Envíos", color: "#002997" },
  bienvenida: { label: "Bienvenida", color: "#5B6584" },
  seguimiento: { label: "Seguimiento", color: "#DC2626" },
};

export const TEMPLATE_CATEGORY_ORDER: TemplateCategory[] = [
  "precios",
  "pagos",
  "envios",
  "bienvenida",
  "seguimiento",
];

// "L 1,500" for whole amounts, "L 1,500.50" with cents (never "1,500.5" or
// three decimals). Fixed en-US grouping (what Honduras writes: comma for
// thousands, dot for cents) instead of the es-HN locale, whose data differs
// between Node and phones and made server and browser disagree. Accepts the
// text Postgres numeric columns can arrive as.
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatLempiras(value: number | string): string {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount)) return "L 0";
  return "L " + (Number.isInteger(amount) ? WHOLE : CENTS).format(amount);
}

// An amount typed by a person: "950", "1,500", "1,500.50", "L 2,300", or
// "1500,50" from a Spanish phone keyboard whose only decimal key is a comma
// (a comma followed by 1–2 digits at the end is cents; followed by 3 it
// separates thousands). Rounded to cents. null when it isn't an amount.
export function parseLempiras(text: string): number | null {
  let t = text.trim().replace(/^L\.?\s*/i, "").replace(/\s/g, "");
  if (!t.includes(".") && /,\d{1,2}$/.test(t)) t = t.replace(/,(\d{1,2})$/, ".$1");
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// The text that goes with a product photo in a chat ("Enviar producto" in
// Chat and Catálogo, and chekelin when it shows a product).
export function productMessageText(
  product: { name: string; price_hnl: number; description: string | null },
  caption?: string,
): string {
  const lines = [`${product.name} — ${formatLempiras(product.price_hnl)}`];
  if (product.description) lines.push(product.description);
  if (caption?.trim()) lines.push(caption.trim());
  return lines.join("\n");
}

// Tints a brand hex color for a soft background (e.g. an unselected filter
// chip) while keeping the same hue as the solid/selected version.
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
