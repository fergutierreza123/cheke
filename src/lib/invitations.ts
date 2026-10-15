// An invitation link opened while signed out: the proxy remembers it in
// this cookie, sends the person to log in, and onboarding brings them back
// to the invitation afterwards.
export const INVITE_COOKIE = "cheke_invite";

// Invitation secrets are 64 hex characters (see create_invitation in 0018).
export function isInviteToken(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{64}$/.test(value));
}
