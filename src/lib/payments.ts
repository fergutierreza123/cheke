// Payment requests sent through chat. Cheke doesn't process money — the
// business pastes a link from its own payment provider (bank payment page,
// PayPal, a gateway) and/or its transfer details, and Cheke sends it and
// tracks the order. Kept free of server-only imports so the Chat screen can
// validate before sending and the server action can validate again.

export type PaymentRequest = {
  concept: string;
  amountHnl: number;
  link?: string | null;
  instructions?: string | null;
};

const MAX_AMOUNT_HNL = 10_000_000;

// "1,250.50", "L 1250", "1 250" → number. Returns null when it isn't a
// positive amount we can trust (so a typo never becomes a wrong charge).
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/lps?\.?|l\.?|\s/gi, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 && value <= MAX_AMOUNT_HNL ? value : null;
}

// Only https links — WhatsApp shows them as tappable, and a plain http or
// javascript: link in a payment request is both a security and a trust risk.
export function normalizePaymentLink(raw: string): { link?: string; error?: string } {
  const text = raw.trim();
  if (!text) return {};
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return { error: "El link de pago no es válido." };
  }
  if (url.protocol !== "https:") return { error: "El link de pago debe empezar con https://" };
  if (!url.hostname.includes(".")) return { error: "El link de pago no es válido." };
  return { link: url.toString() };
}

export function formatAmount(amountHnl: number): string {
  return "L " + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amountHnl);
}

// The chat message the customer receives. WhatsApp renders *bold*.
export function buildPaymentMessage({ concept, amountHnl, link, instructions }: PaymentRequest): string {
  const lines = ["💳 *Pago pendiente*", `Concepto: ${concept.trim()}`, `Total: *${formatAmount(amountHnl)}*`];
  if (link) lines.push("", `Paga aquí:\n${link}`);
  if (instructions?.trim()) lines.push("", instructions.trim());
  lines.push("", "Cuando hayas pagado, envíanos tu comprobante por este chat. ¡Gracias!");
  return lines.join("\n");
}
