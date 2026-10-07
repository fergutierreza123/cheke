// WhatsApp only allows free-form messages for 24h after the customer's last
// message; after that only Meta-approved templates. Kept in its own file
// (no server-only imports) so both the server actions and the Chat screen
// can use it. Conversations with no window recorded (demo/seeded ones) are
// treated as open.
export const WINDOW_CLOSED_MESSAGE =
  "Pasaron más de 24 horas desde el último mensaje de este cliente. WhatsApp solo permite escribirle con una plantilla aprobada por Meta.";

export function isWhatsAppWindowClosed(windowExpiresAt: string | null | undefined, nowMs: number): boolean {
  if (!windowExpiresAt) return false;
  return new Date(windowExpiresAt).getTime() < nowMs;
}
