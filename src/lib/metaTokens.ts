// Pure helpers about Meta access tokens and Graph API errors (issue #56).
// No imports on purpose: scripts/check-meta-tokens.ts runs this file
// directly with Node to check the rules below.

export type GraphError = { code?: number; error_subcode?: number; message?: string } | null | undefined;

// Messenger/Instagram answer some *policy* refusals with code 200 too (e.g.
// another app controls the thread, the person can't be messaged). Those are
// not a broken connection, so reconnecting wouldn't help.
const NOT_AUTH_SUBCODES = new Set([1545041, 2018108, 2018109, 2018278, 2018028]);

// True when Meta refused the call because the token no longer works for that
// asset: 190 = token expired/revoked (password change, app removed, 60 days
// passed), 102 = session expired, 200–299 = permission missing on the
// WABA/Page (the client removed cheke or unshared the account), 131005 =
// WhatsApp "access denied". These mean "Reconectar", not "try again".
export function isMetaAuthError(error: GraphError): boolean {
  const code = error?.code;
  if (typeof code !== "number") return false;
  if (code === 190 || code === 102 || code === 131005) return true;
  if (code >= 200 && code <= 299) {
    return !(typeof error?.error_subcode === "number" && NOT_AUTH_SUBCODES.has(error.error_subcode));
  }
  return false;
}

// debug_token gives unix seconds; 0 (or nothing) means "never".
export function metaTimestampToIso(seconds: unknown): string | null {
  const n = typeof seconds === "number" ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export const EXPIRY_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// What the daily check should do about one channel's token:
// - "expired": the date already passed → mark it "Reconectar" now.
// - "warn": it ends within 7 days and nobody was told yet → warn once.
// - null: nothing to do (no known expiry, far away, already warned/marked).
export function expiryAction(
  channel: { token_expires_at: string | null; expiry_warned_at: string | null; reauth_required_at: string | null },
  now: number,
  windowDays = EXPIRY_WARNING_DAYS,
): "expired" | "warn" | null {
  if (!channel.token_expires_at || channel.reauth_required_at) return null;
  const expiresAt = new Date(channel.token_expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return null;
  if (expiresAt <= now) return "expired";
  if (channel.expiry_warned_at) return null;
  return expiresAt - now <= windowDays * DAY_MS ? "warn" : null;
}

// Whole days left until `iso` (at least 1 while it's still in the future).
export function daysLeft(iso: string, now: number): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - now) / DAY_MS));
}

// The id of each Page a Facebook Login for Business token was granted,
// from debug_token's granular_scopes. A System-user ("General + System-user
// + Never") token may not list the Pages under /me/accounts, but it always
// says which Pages it can message here.
export function grantedPageIds(granularScopes: unknown): string[] {
  if (!Array.isArray(granularScopes)) return [];
  const ids = new Set<string>();
  for (const s of granularScopes) {
    const scope = (s as { scope?: unknown })?.scope;
    const targets = (s as { target_ids?: unknown })?.target_ids;
    if ((scope === "pages_messaging" || scope === "pages_show_list") && Array.isArray(targets)) {
      for (const id of targets) if (typeof id === "string" && /^\d+$/.test(id)) ids.add(id);
    }
  }
  return [...ids];
}
