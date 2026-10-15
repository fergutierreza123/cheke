import type { ChannelType } from "@/lib/types";
import { WINDOW_CLOSED_MESSAGE } from "@/lib/whatsappWindow";

// When a business may still write to a customer, per channel. Kept free of
// server-only imports so the Chat screen and the server share one rule.
//
// - "open": less than 24 h since the customer's last message. Anyone,
//   chekelin included, can reply normally.
// - "human_agent": Instagram/Facebook only, 24 h – 7 days. Meta's Human Agent
//   feature lets a *person* still answer (the message goes out with the
//   HUMAN_AGENT tag); chekelin and automations must not.
// - "closed": WhatsApp after 24 h (only approved templates), Instagram /
//   Facebook after 7 days (nothing until the customer writes again).
//
// window_expires_at stores "last inbound message + 24 h". Conversations with
// no window recorded (demo/seeded ones) are treated as open.
export type ReplyWindow = "open" | "human_agent" | "closed";

const HUMAN_AGENT_EXTRA_MS = 6 * 24 * 60 * 60 * 1000; // 24 h + 6 days = 7 days

export function replyWindow(
  channelType: ChannelType | null | undefined,
  windowExpiresAt: string | null | undefined,
  nowMs: number,
): ReplyWindow {
  if (!windowExpiresAt || !channelType) return "open";
  const expires = new Date(windowExpiresAt).getTime();
  if (!Number.isFinite(expires) || nowMs <= expires) return "open";
  if (channelType === "whatsapp") return "closed";
  return nowMs <= expires + HUMAN_AGENT_EXTRA_MS ? "human_agent" : "closed";
}

function networkName(channelType: ChannelType): string {
  return channelType === "instagram" ? "Instagram" : "Facebook";
}

// Shown in Chat (and returned by the server) when sending is blocked.
export function windowClosedMessage(channelType: ChannelType | null | undefined): string {
  if (!channelType || channelType === "whatsapp") return WINDOW_CLOSED_MESSAGE;
  return `Pasaron más de 7 días desde el último mensaje de este cliente. ${networkName(channelType)} no permite escribirle hasta que vuelva a enviarte un mensaje.`;
}

// Shown in Chat (not blocking) between 24 h and 7 days on Instagram/Facebook.
export function humanAgentNotice(channelType: ChannelType): string {
  return `Pasaron más de 24 horas desde el último mensaje de este cliente. En ${networkName(channelType)} todavía puedes responderle tú (hasta 7 días), pero chekelin ya no contesta.`;
}
