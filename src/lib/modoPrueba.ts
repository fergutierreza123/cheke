// Modo prueba (Chat): a person types, records or attaches *as the customer*
// to see how chekelin answers. Only in sample chats (a channel that isn't
// really connected) and the app reviewers' demo Negocio: a fake customer
// message in a real chat would mix into the customer's history and restart
// chekelin's and the team's timers. Nothing is ever sent to Meta.

export const SIMULATE_ONLY_IN_SAMPLES =
  "El modo prueba solo funciona en chats de ejemplo. Este chat es con un cliente real: escríbele normalmente.";

// A channel really connected to a customer's WhatsApp, Instagram or Facebook
// (seeded sample chats have no credentials).
export function isLiveChannel(channel: { access_token_encrypted?: string | null } | null | undefined): boolean {
  return Boolean(channel?.access_token_encrypted);
}

export function canSimulate(
  channel: { access_token_encrypted?: string | null } | null | undefined,
  isDemoBusiness: boolean,
): boolean {
  return !isLiveChannel(channel) || isDemoBusiness;
}

// The "customer" just wrote: like a real inbound message, the reply window
// opens for 24 h and a closed conversation reopens.
export function simulatedInboundUpdate(nowMs: number) {
  return {
    last_message_at: new Date(nowMs).toISOString(),
    window_expires_at: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    status: "open" as const,
  };
}
