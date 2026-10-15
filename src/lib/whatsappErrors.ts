import type { SupabaseClient } from "@supabase/supabase-js";

// Meta's WhatsApp error codes, explained in plain Spanish for Chat.
// Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
// (checked Oct 2026). Only the codes a business can actually hit when
// sending are listed; anything else falls back to a generic sentence.

// Where a business adds or fixes the card Meta charges for WhatsApp messages.
export const META_BILLING_HUB_URL = "https://business.facebook.com/latest/billing_hub/payment_methods/";

// 131042 = "There was an error related to your payment method" (no payment
// method, credit line over the limit, account suspended...). Since Oct 1,
// 2026 it's also what a business without a card hits once its 1,000 free
// replies of the month are used up.
export const BILLING_ERROR_CODE = 131042;

const TEMPLATE_PROBLEM = "hay un problema con la plantilla (no está aprobada, está pausada o le faltan datos).";
const RECONNECT = "la conexión de cheKe con tu WhatsApp ya no es válida. Vuelve a conectar WhatsApp en Canales.";

const REASONS: Record<number, string> = {
  [BILLING_ERROR_CODE]:
    "tu cuenta de Meta no tiene un método de pago válido. Agrega una tarjeta en Billing Hub de Meta (ve a Canales).",
  131047: "pasaron más de 24 horas desde el último mensaje del cliente. Envíale una plantilla.",
  131026: "ese número no tiene WhatsApp, o el cliente usa una versión muy vieja de WhatsApp.",
  131049: "Meta lo frenó para no saturar al cliente con mensajes de marketing. Espera al menos 24 horas antes de reintentar.",
  131050: "el cliente pidió no recibir mensajes de marketing de tu negocio.",
  130403: "bloqueaste a este cliente en WhatsApp. Desbloquéalo para poder escribirle.",
  130497: "tu cuenta de WhatsApp no puede enviar mensajes a clientes de ese país.",
  131031: "Meta restringió o desactivó tu cuenta de WhatsApp Business.",
  131048: "Meta limitó cuántos mensajes puede enviar tu número. Revisa la calidad de tu número en Meta.",
  131056: "enviaste demasiados mensajes seguidos a este cliente. Espera un momento y vuelve a intentar.",
  130429: "se enviaron demasiados mensajes a la vez. Vuelve a intentar en un momento.",
  131064: "tu cuenta llegó a su límite de mensajes por problemas con la categoría de tus plantillas.",
  131063: "los mensajes de marketing están desactivados para tu número.",
  131051: "WhatsApp no admite este tipo de mensaje.",
  131053: "no se pudo subir la imagen o archivo del mensaje.",
  131045: "hay un problema con el registro de tu número de WhatsApp.",
  133010: "tu número no está registrado en la plataforma de WhatsApp Business.",
  131037: "Meta todavía no aprueba el nombre visible de tu número.",
  131057: "tu cuenta de WhatsApp Business está en mantenimiento. Intenta más tarde.",
  131016: "WhatsApp tiene una falla temporal. Vuelve a intentar en unos minutos.",
  131000: "WhatsApp tuvo un error desconocido. Vuelve a intentar.",
  131021: "no puedes enviarte mensajes a tu propio número.",
  132000: TEMPLATE_PROBLEM,
  132001: TEMPLATE_PROBLEM,
  132005: TEMPLATE_PROBLEM,
  132007: "la plantilla no cumple las políticas de WhatsApp.",
  132012: TEMPLATE_PROBLEM,
  132015: "la plantilla está pausada por baja calidad.",
  132016: "la plantilla fue desactivada por baja calidad.",
  190: RECONNECT,
  131005: RECONNECT,
};

// The sentence Chat shows under a failed message.
export function explainWhatsAppError(code: number | null | undefined, metaText?: string | null): string {
  const reason = code != null ? REASONS[code] : undefined;
  if (reason) return `WhatsApp no entregó este mensaje: ${reason}`;
  if (isBillingError(code, metaText)) return `WhatsApp no entregó este mensaje: ${REASONS[BILLING_ERROR_CODE]}`;
  if (code != null) return `WhatsApp no entregó este mensaje (código ${code}).`;
  return "WhatsApp no entregó este mensaje.";
}

// Marks a message we tried to send as failed, with the reason Meta gave
// when it refused the send outright (a send error, not a status webhook).
// Without a Meta error code (e.g. the channel isn't connected) cheKe's own
// error text is the reason.
export async function markMessageFailed(
  supabase: SupabaseClient,
  messageId: string,
  result: { error?: string; errorCode?: number; errorDetails?: string },
) {
  const fromMeta = result.errorCode != null || isBillingError(result.errorCode, result.errorDetails);
  const fields = {
    status: "failed" as const,
    error_code: result.errorCode ?? null,
    error_details: result.errorDetails ?? null,
    error_reason: fromMeta ? explainWhatsAppError(result.errorCode, result.errorDetails) : (result.error ?? null),
  };
  const { error } = await supabase.from("messages").update(fields).eq("id", messageId);
  // Migration 0017 not run yet (unknown columns): still mark it failed.
  if (error) await supabase.from("messages").update({ status: "failed" }).eq("id", messageId);
  return fields;
}

// Whether a failure looks like a billing/payment problem on the business's
// Meta account — the case where every reply will keep failing until they
// add a card. 134011 is about the WhatsApp Payments product (charging
// customers), not about paying Meta, so it doesn't count.
export function isBillingError(code: number | null | undefined, metaText?: string | null): boolean {
  if (code === BILLING_ERROR_CODE) return true;
  if (code === 134011) return false;
  return Boolean(metaText && /payment method|payment account|billing|credit line/i.test(metaText));
}
