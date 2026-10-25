import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";
import { sendPushToPeople } from "@/lib/push";
import { systemUserToken } from "@/lib/whatsapp";
import { daysLeft, expiryAction, metaTimestampToIso } from "@/lib/metaTokens";
import type { ChannelType } from "@/lib/types";

// Server-only. Keeps each Canal's Meta connection healthy (issue #56):
// - records when a token ends (debug_token) right after connecting;
// - marks a Canal "Reconectar" when Meta refuses its token (code 190, or a
//   permission error on the client's WhatsApp account / Page), and tells the
//   Dueños and the Tienda's Gerentes once. The Canal stays "connected":
//   customers' messages keep arriving, only replies need the reconnect;
// - warns them ~7 days before a known end date (daily cron);
// - regenerates an Instagram/Facebook Page token from the stored client token.
//
// Migration 0029 adds the columns. Every function here is best effort and
// never throws: a health problem must not break a send or a webhook.

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
type Admin = ReturnType<typeof createAdminClient>;

export type TokenInfo = {
  isValid: boolean;
  // null = never ends
  expiresAt: string | null;
  dataAccessExpiresAt: string | null;
  // "USER", "PAGE", "SYSTEM_USER"...
  type: string | null;
  granularScopes: unknown;
};

// What Meta says about a token: valid?, when it ends. Uses the app's own
// token (APP_ID|APP_SECRET), so it works for any token issued to our app.
export async function debugToken(token: string): Promise<TokenInfo | null> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret || !token) return null;
  try {
    const res = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}`, {
      headers: { Authorization: `Bearer ${appId}|${appSecret}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    const data = body?.data;
    if (!res.ok || !data) return null;
    return {
      isValid: Boolean(data.is_valid),
      expiresAt: metaTimestampToIso(data.expires_at),
      dataAccessExpiresAt: metaTimestampToIso(data.data_access_expires_at),
      type: typeof data.type === "string" ? data.type : null,
      granularScopes: data.granular_scopes,
    };
  } catch {
    return null;
  }
}

// Embedded Signup's code gives a business integration system user token that
// ends in 60 days with our current config. Meta's Token Management API mints
// one for the same client that never ends unless `set_token_expires_in_60_days`
// is sent (issue #56):
// https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business
// Returns it only when debug_token confirms it's valid and never ends; null
// otherwise (then the Canal keeps the 60-day token and the expiry warnings).
export async function neverExpiringBisuToken(token: string): Promise<{ token: string; info: TokenInfo } | null> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !token) return null;
  const proof = createHmac("sha256", appSecret).update(token).digest("hex");
  const auth = `access_token=${encodeURIComponent(token)}&appsecret_proof=${proof}`;
  try {
    const meRes = await fetch(`${GRAPH}/me?fields=client_business_id&${auth}`, { signal: AbortSignal.timeout(10_000) });
    const me = await meRes.json().catch(() => null);
    if (!meRes.ok || !me?.client_business_id) return null;
    const systemUser = me.id ? `&system_user_id=${encodeURIComponent(me.id)}` : "";
    const mintRes = await fetch(
      `${GRAPH}/${encodeURIComponent(me.client_business_id)}/system_user_access_tokens?${auth}${systemUser}`,
      { method: "POST", signal: AbortSignal.timeout(10_000) },
    );
    const minted = await mintRes.json().catch(() => null);
    const newToken: unknown = minted?.access_token;
    if (!mintRes.ok || typeof newToken !== "string" || !newToken) return null;
    const info = await debugToken(newToken);
    return info?.isValid && !info.expiresAt ? { token: newToken, info } : null;
  } catch {
    return null;
  }
}

// The columns to save on a Canal right after (re)connecting: the new token's
// end dates, and a clean slate for the "Reconectar" / warning state.
export function freshConnectionFields(info: TokenInfo | null) {
  return {
    token_expires_at: info?.expiresAt ?? null,
    data_access_expires_at: info?.dataAccessExpiresAt ?? null,
    reauth_required_at: null,
    reauth_reason: null,
    reauth_notified_at: null,
    expiry_warned_at: null,
  };
}

type HealthChannel = {
  id: string;
  business_id: string;
  store_id: string;
  type: ChannelType;
  page_id: string | null;
  status: string;
  reauth_required_at: string | null;
};

const HEALTH_COLUMNS = "id, business_id, store_id, type, page_id, status, reauth_required_at";

// A Page and its Instagram share one token, so they break and get fixed
// together.
async function connectionGroup(admin: Admin, channel: HealthChannel): Promise<HealthChannel[]> {
  if (channel.type === "whatsapp" || !channel.page_id) return [channel];
  const { data } = await admin
    .from("channels")
    .select(HEALTH_COLUMNS)
    .eq("business_id", channel.business_id)
    .eq("page_id", channel.page_id)
    .in("type", ["facebook", "instagram"])
    .eq("status", "connected");
  return (data as HealthChannel[] | null)?.length ? (data as HealthChannel[]) : [channel];
}

function connectionLabel(type: ChannelType): string {
  return type === "whatsapp" ? "WhatsApp" : "Instagram y Facebook";
}

// The Dueños and the Tienda's Gerentes: the people who can reconnect.
async function peopleWhoCanReconnect(admin: Admin, businessId: string, storeId: string): Promise<string[]> {
  const [{ data: members }, { data: inStore }] = await Promise.all([
    admin.from("members").select("user_id, role").eq("business_id", businessId),
    admin.from("store_members").select("user_id").eq("store_id", storeId),
  ]);
  const storePeople = new Set((inStore ?? []).map((r) => r.user_id as string));
  return (members ?? [])
    .filter((m) => m.role === "owner" || (m.role === "manager" && storePeople.has(m.user_id as string)))
    .map((m) => m.user_id as string);
}

async function notifyReconnect(admin: Admin, channel: HealthChannel, title: string, body: string) {
  const people = await peopleWhoCanReconnect(admin, channel.business_id, channel.store_id);
  await sendPushToPeople(admin, channel.business_id, channel.store_id, people, {
    title,
    body,
    conversationId: "",
    url: "/channels",
  });
}

// Meta refused this Canal's token: show "Reconectar" in Canales and tell the
// people who can fix it — once, until it's reconnected.
export async function markChannelNeedsReconnect(channelId: string, reason: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: channel } = await admin.from("channels").select(HEALTH_COLUMNS).eq("id", channelId).maybeSingle();
    const row = channel as HealthChannel | null;
    if (!row || row.status !== "connected" || row.reauth_required_at) return;

    const group = await connectionGroup(admin, row);
    const now = new Date().toISOString();
    const { data: marked, error } = await admin
      .from("channels")
      .update({ reauth_required_at: now, reauth_reason: reason.slice(0, 200) })
      .in(
        "id",
        group.map((c) => c.id),
      )
      .is("reauth_required_at", null)
      .select("id");
    // Nothing changed: someone else marked it a moment ago (or migration 0029
    // isn't applied yet). Either way, don't notify twice.
    if (error || !marked?.length) return;

    const label = connectionLabel(row.type);
    await notifyReconnect(
      admin,
      row,
      `Reconecta ${label} en cheke`,
      `Meta cerró la conexión de ${label}. Los mensajes siguen llegando, pero para responder desde cheke toca «Reconectar» en Canales.`,
    );
    await admin
      .from("channels")
      .update({ reauth_notified_at: new Date().toISOString() })
      .in(
        "id",
        marked.map((c) => c.id),
      );
  } catch (error) {
    console.error("channel health: could not mark reconnect", error);
  }
}

// Instagram/Facebook: gets a new Page token with the client's stored token
// (GET /<PAGE_ID>?fields=access_token) and saves it for the Page and its
// Instagram. Returns it, or null when there's no stored client token or Meta
// refuses it too (then the Canal really needs "Reconectar").
export async function regeneratePageToken(channelId: string): Promise<{ pageId: string; accessToken: string } | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("channels")
      .select("business_id, page_id, credential_token_encrypted")
      .eq("id", channelId)
      .maybeSingle();
    if (!data?.page_id || !data.credential_token_encrypted) return null;
    const credential = decryptSecret(data.credential_token_encrypted);
    const res = await fetch(`${GRAPH}/${encodeURIComponent(data.page_id)}?fields=access_token`, {
      headers: { Authorization: `Bearer ${credential}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    const pageToken: string | undefined = body?.access_token;
    if (!res.ok || !pageToken) return null;

    const info = await debugToken(pageToken);
    await admin
      .from("channels")
      .update({
        access_token_encrypted: encryptSecret(pageToken),
        token_expires_at: info?.expiresAt ?? null,
        data_access_expires_at: info?.dataAccessExpiresAt ?? null,
      })
      .eq("business_id", data.business_id)
      .eq("page_id", data.page_id)
      .in("type", ["facebook", "instagram"])
      .eq("status", "connected");
    return { pageId: data.page_id, accessToken: pageToken };
  } catch (error) {
    console.error("channel health: could not regenerate page token", error);
    return null;
  }
}

type ExpiryChannel = HealthChannel & { token_expires_at: string | null; expiry_warned_at: string | null };

// Daily (Vercel Cron, /api/cron/channel-health): warns ~7 days before a
// Canal's token ends, and marks "Reconectar" once it has ended. WhatsApp
// Canales are skipped while META_SYSTEM_USER_TOKEN is set: they send with
// that never-ending token, so their own token's end date doesn't matter.
export async function runChannelHealth(admin: Admin) {
  const now = Date.now();
  const horizon = new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("channels")
    .select(`${HEALTH_COLUMNS}, token_expires_at, expiry_warned_at`)
    .eq("status", "connected")
    .not("token_expires_at", "is", null)
    .lt("token_expires_at", horizon);
  if (error) return { error: error.message };

  const usingSystemToken = Boolean(systemUserToken());
  const handledPages = new Set<string>();
  let warned = 0;
  let expired = 0;
  for (const channel of (data ?? []) as ExpiryChannel[]) {
    if (channel.type === "whatsapp" && usingSystemToken) continue;
    if (channel.page_id) {
      const key = `${channel.business_id}:${channel.page_id}`;
      if (handledPages.has(key)) continue;
      handledPages.add(key);
    }
    const action = expiryAction(channel, now);
    if (action === "expired") {
      await markChannelNeedsReconnect(channel.id, "token_expired");
      expired++;
    } else if (action === "warn" && channel.token_expires_at) {
      const group = await connectionGroup(admin, channel);
      const { data: marked } = await admin
        .from("channels")
        .update({ expiry_warned_at: new Date().toISOString() })
        .in(
          "id",
          group.map((c) => c.id),
        )
        .is("expiry_warned_at", null)
        .select("id");
      if (!marked?.length) continue;
      const label = connectionLabel(channel.type);
      const days = daysLeft(channel.token_expires_at, now);
      await notifyReconnect(
        admin,
        channel,
        `Tu conexión de ${label} vence en ${days} día${days === 1 ? "" : "s"}`,
        `Toca «Reconectar» en Canales para seguir respondiendo desde cheke sin interrupciones.`,
      );
      warned++;
    }
  }

  // The shared token every WhatsApp goes through: say so loudly if it broke.
  let systemToken: "unset" | "ok" | "invalid" | "unknown" = "unset";
  const system = systemUserToken();
  if (system) {
    const info = await debugToken(system);
    systemToken = info ? (info.isValid ? "ok" : "invalid") : "unknown";
    if (systemToken === "invalid") console.error("channel health: META_SYSTEM_USER_TOKEN is no longer valid");
  }

  return { checked: data?.length ?? 0, warned, expired, systemToken };
}
