import type { ChannelType, ConversationStage } from "@/lib/types";

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
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

export function formatLempiras(value: number): string {
  return "L " + value.toLocaleString("es-HN");
}

// Tints a brand hex color for a soft background (e.g. an unselected filter
// chip) while keeping the same hue as the solid/selected version.
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
