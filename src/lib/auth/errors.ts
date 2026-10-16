import type { AuthError } from "@supabase/supabase-js";

// Supabase Auth errors in plain Spanish for the login and "Mi cuenta"
// screens. Never shows the raw English message.

export const USE_EMAIL_INSTEAD =
  "Por ahora los códigos por mensaje de texto solo llegan a celulares de Honduras (+504). Usa tu correo.";

export const SMS_UNAVAILABLE =
  "En este momento no podemos enviar mensajes de texto. Entra con tu correo mientras lo arreglamos.";

export type CodeChannel = "phone" | "email";

export function sendErrorMessage(error: AuthError, channel: CodeChannel): string {
  const code = error.code ?? "";
  const message = error.message.toLowerCase();

  if (code === "over_sms_send_rate_limit" || code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error.status === 429) {
    return "Ya te enviamos un código hace poco. Espera un minuto y vuelve a pedirlo.";
  }
  if (channel === "phone") {
    if (code === "phone_exists") return "Ese número ya está en otra cuenta de cheke.";
    // The database refuses phones outside +504 (migration 0020); Supabase
    // reports that as a generic "Database error".
    if (message.includes("database error")) return USE_EMAIL_INSTEAD;
    // Phone provider not set up yet in Supabase (Twilio Verify), or Twilio
    // refused to send.
    if (code === "phone_provider_disabled" || code === "sms_send_failed" || message.includes("provider") || message.includes("sms")) {
      return SMS_UNAVAILABLE;
    }
    if (message.includes("invalid") && message.includes("phone")) {
      return "Ese número no parece correcto. Revisa los 8 dígitos.";
    }
  } else {
    if (code === "email_address_invalid" || (message.includes("invalid") && message.includes("email"))) {
      return "Ese correo no parece correcto. Revísalo e inténtalo de nuevo.";
    }
    if (code === "email_provider_disabled" || code === "email_address_not_authorized" || message.includes("sending")) {
      return "No pudimos enviar el correo en este momento. Inténtalo de nuevo en unos minutos.";
    }
  }
  if (code === "signup_disabled") return "Por ahora no se pueden crear cuentas nuevas.";
  if (code === "user_banned") return "Esta cuenta está bloqueada. Escríbenos para ayudarte.";
  return "No pudimos enviar el código. Inténtalo de nuevo.";
}

export function verifyErrorMessage(error: AuthError): string {
  const code = error.code ?? "";
  if (code === "otp_expired" || error.message.toLowerCase().includes("expired") || error.message.toLowerCase().includes("invalid")) {
    return "El código no es correcto o ya venció. Revísalo o pide uno nuevo.";
  }
  if (code === "over_request_rate_limit" || error.status === 429) {
    return "Demasiados intentos. Espera un minuto y vuelve a intentarlo.";
  }
  return "No pudimos revisar el código. Inténtalo de nuevo.";
}
