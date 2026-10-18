// An invitation link opened while signed out: the proxy remembers it in
// this cookie, sends the person to log in, and onboarding brings them back
// to the invitation afterwards.
export const INVITE_COOKIE = "cheke_invite";

// Invitation secrets are 64 hex characters (see create_invitation in 0018).
export function isInviteToken(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{64}$/.test(value));
}

// Why joining failed, as a fixed code in the invitation page's URL
// (?error=used). The page shows a fixed sentence for each code, never text
// taken from the URL (issue #35: anyone could send a link that displays a
// message of their choosing on cheke's page).
export const INVITATION_ERRORS = {
  used: "Esta invitación ya se usó. Pide una nueva.",
  expired: "Esta invitación venció. Pide una nueva.",
  missing: "Esta invitación no existe.",
  revoked: "Esta invitación ya no es válida. Pide una nueva.",
  member: "Ya eres parte de este negocio.",
  other_business: "Tu cuenta ya pertenece a otro negocio en cheke.",
  unknown: "No pudimos unirte al negocio. Inténtalo de nuevo.",
} as const;

export type InvitationErrorCode = keyof typeof INVITATION_ERRORS;

// The code for an accept_invitation error (the database's messages, 0018).
export function invitationErrorCode(message: string | null | undefined): InvitationErrorCode {
  const text = (message ?? "").toLowerCase();
  if (text.includes("ya se usó")) return "used";
  if (text.includes("venció")) return "expired";
  if (text.includes("no existe")) return "missing";
  if (text.includes("ya no es válida")) return "revoked";
  if (text.includes("ya eres parte")) return "member";
  if (text.includes("otro negocio")) return "other_business";
  return "unknown";
}

// The sentence for a ?error= value; null for anything that isn't a known code.
export function invitationErrorMessage(code: string | null | undefined): string | null {
  return code && Object.hasOwn(INVITATION_ERRORS, code) ? INVITATION_ERRORS[code as InvitationErrorCode] : null;
}
