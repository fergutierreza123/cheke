// Campaña: one approved WhatsApp template to every Contacto with an
// Etiqueta. Pure helpers, safe in browser components. Tables: broadcasts,
// broadcast_recipients (migration 0042); server side: broadcastsServer.ts.
// Facts and sources: docs/research/difusion-whatsapp.md.

import { HNL_PER_USD } from "@/lib/chekelinCost";
import { firstName } from "@/lib/whatsappTemplates";
import { hasAnyTag } from "@/lib/tags";

// USD per delivered message, "Rest of Latin America" (includes Honduras),
// in force since Oct 1 2026. Source: Meta's rate card linked from
// https://developers.facebook.com/docs/whatsapp/pricing (read Oct 26 2026).
export const RATE_USD = { MARKETING: 0.074, UTILITY: 0.0113 } as const;

// A new business portfolio may message 250 different customers outside the
// 24 h window per rolling 24 h; used when Meta's value can't be read.
// Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits.md
export const DEFAULT_DAILY_LIMIT = 250;

export type BroadcastContact = {
  id: string;
  name: string | null;
  phone: string | null;
  tags?: string[] | null;
  marketing_opt_out?: boolean | null;
};

function digits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 8 ? `504${d}` : d;
}

// US numbers (+1) never receive Marketing templates (Meta per-user limits).
function isUsNumber(phone: string): boolean {
  const d = digits(phone);
  return d.length === 11 && d.startsWith("1");
}

export function isMarketing(category: string | null | undefined): boolean {
  return (category ?? "").toUpperCase() === "MARKETING";
}

// Who gets the Campaña: contacts with any picked Etiqueta, a phone, not
// opted out of offers and (Marketing only) not a +1 number. One per phone.
export function broadcastRecipients<T extends BroadcastContact>(
  contacts: T[],
  tags: string[],
  category: string,
): { recipients: T[]; noPhone: number; optedOut: number; usNumbers: number } {
  const result = { recipients: [] as T[], noPhone: 0, optedOut: 0, usNumbers: 0 };
  if (!tags.length) return result;
  const seen = new Set<string>();
  for (const c of contacts) {
    if (!hasAnyTag(c, tags)) continue;
    const phone = c.phone ? digits(c.phone) : "";
    if (phone.length < 8) result.noPhone++;
    else if (c.marketing_opt_out) result.optedOut++;
    else if (isMarketing(category) && isUsNumber(phone)) result.usNumbers++;
    else if (!seen.has(phone)) {
      seen.add(phone);
      result.recipients.push(c);
    }
  }
  return result;
}

export function estimateCost(count: number, category: string): { usd: number; hnl: number } {
  const usd = count * (isMarketing(category) ? RATE_USD.MARKETING : RATE_USD.UTILITY);
  return { usd, hnl: usd * HNL_PER_USD };
}

// Meta's whatsapp_business_manager_messaging_limit ("TIER_250", "TIER_2K",
// "TIER_100K", "TIER_UNLIMITED"…) → customers per 24 h. null = unreadable.
export function parseMessagingLimit(value: unknown): number | null {
  if (typeof value === "number" && value > 0) return value;
  if (typeof value !== "string") return null;
  if (/unlimited/i.test(value)) return Number.POSITIVE_INFINITY;
  const m = value.match(/(\d+)\s*(K)?/i);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

// How many to send now: what's left of today's limit, capped by the batch.
export function batchSize(limit: number, sentLast24h: number, max: number): number {
  return Math.max(0, Math.min(limit - sentLast24h, max));
}

export const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
const MARKETING_LIMITED = 131049;
const MARKETING_STOPPED = 131050;

// What happens to a recipient whose send failed. 131049: Meta held it back
// for this customer; retry once, never before 24 h (sooner blocks 24 h more).
// 131050: the customer stopped offers in WhatsApp → opt them out.
// `attempts` already counts this try.
export function afterFailure(
  code: number | null | undefined,
  attempts: number,
  now: number,
): { status: "pending" | "failed"; nextAttemptAt?: string; optOut: boolean } {
  if (code === MARKETING_LIMITED && attempts < 2) {
    return { status: "pending", nextAttemptAt: new Date(now + RETRY_AFTER_MS).toISOString(), optOut: false };
  }
  return { status: "failed", optOut: code === MARKETING_STOPPED };
}

// "BAJA", "no más", "stop"… as the whole reply (a longer message is a
// conversation for a person or chekelin, not an opt-out).
const OPT_OUT = /^(baja|darme de baja|dar de baja|no m[aá]s|no mas mensajes|no m[aá]s ofertas|stop|parar|alto|cancelar suscripci[oó]n)$/;
export function isOptOutReply(text: string | null | undefined): boolean {
  const clean = (text ?? "")
    .toLowerCase()
    .replace(/[.!¡?¿,"'*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return OPT_OUT.test(clean);
}

// The values for one customer: the name variable gets their first name, or
// the typed fallback when we don't have a name.
export function recipientValues(
  values: Record<string, string>,
  nameVariable: string | null | undefined,
  contactName: string | null | undefined,
): Record<string, string> {
  if (!nameVariable) return values;
  return { ...values, [nameVariable]: firstName(contactName) ?? values[nameVariable] ?? "" };
}
