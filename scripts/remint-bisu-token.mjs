// EXPERIMENT (issue #56, research option 5). Never run automatically.
//
// Embedded Signup gives each WhatsApp client a Business Integration System
// User (BISU) token that ends in 60 days. Meta's BISU Token Management API
// (POST /<CLIENT_BUSINESS_ID>/system_user_access_tokens) makes the 60 days
// *optional* (`set_token_expires_in_60_days`), so a token minted without
// that flag may never expire. Nobody has confirmed it: this script tries it
// on ONE channel and tells you what Meta answered.
//
// Usage (from the repo root, Node 22.18+ / 24, with the same variables as
// Vercel in .env.local):
//   node --env-file=.env.local scripts/remint-bisu-token.mjs <channel_id>
//       Read-only: shows the channel token's type and end date, and the
//       client's business id. Changes nothing.
//   node --env-file=.env.local scripts/remint-bisu-token.mjs <channel_id> --mint
//       Mints a new token WITHOUT the 60-day flag, checks it with
//       debug_token, and — only if Meta says it works — saves it (encrypted)
//       on that channel with its new end date. Minting may cancel the old
//       token, which is why it's saved right away.
//
// Try it first on a TEST client (your own WhatsApp), never on a paying one.
// Needs: NEXT_PUBLIC_META_APP_ID, WHATSAPP_APP_SECRET, CHANNEL_TOKEN_KEY,
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Tokens are never
// printed.

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "../src/lib/crypto.ts";
import { GRAPH_API_VERSION } from "../src/lib/meta.ts";

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const [channelId, flag] = process.argv.slice(2);
const mint = flag === "--mint";
if (!channelId) {
  console.error("Usage: node --env-file=.env.local scripts/remint-bisu-token.mjs <channel_id> [--mint]");
  process.exit(1);
}

const appId = process.env.NEXT_PUBLIC_META_APP_ID;
const appSecret = process.env.WHATSAPP_APP_SECRET;
for (const name of ["NEXT_PUBLIC_META_APP_ID", "WHATSAPP_APP_SECRET", "CHANNEL_TOKEN_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[name]) {
    console.error(`Missing ${name} (add it to .env.local).`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const proof = (token) => createHmac("sha256", appSecret).update(token).digest("hex");
const when = (seconds) => (!seconds ? "never" : new Date(seconds * 1000).toISOString());

async function graph(path, { token, method = "GET", params = {} } = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  const body = new URLSearchParams({ ...params, appsecret_proof: proof(token) });
  const init = { method, headers: { Authorization: `Bearer ${token}` } };
  if (method === "GET") for (const [k, v] of body) url.searchParams.set(k, v);
  else init.body = body;
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

async function debug(token) {
  const res = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${appId}|${appSecret}` },
  });
  const body = await res.json().catch(() => null);
  return body?.data ?? null;
}

const { data: channel, error } = await supabase
  .from("channels")
  .select("id, type, status, display_phone, verified_name, access_token_encrypted")
  .eq("id", channelId)
  .maybeSingle();
if (error || !channel) {
  console.error("Channel not found.", error?.message ?? "");
  process.exit(1);
}
if (channel.type !== "whatsapp" || !channel.access_token_encrypted) {
  console.error("This only works on a connected WhatsApp channel (with its own token).");
  process.exit(1);
}
console.log(`Channel: ${channel.verified_name ?? ""} ${channel.display_phone ?? ""} (${channel.status})`);

const current = decryptSecret(channel.access_token_encrypted);
const info = await debug(current);
if (!info) {
  console.error("debug_token failed. Check NEXT_PUBLIC_META_APP_ID / WHATSAPP_APP_SECRET.");
  process.exit(1);
}
console.log(`Current token: type=${info.type} valid=${info.is_valid} expires=${when(info.expires_at)} data_access_expires=${when(info.data_access_expires_at)}`);
const scopes = Array.isArray(info.scopes) ? info.scopes : [];
console.log(`Scopes: ${scopes.join(", ") || "(none)"}`);
if (!info.is_valid) {
  console.error("The current token no longer works: reconnect the channel in Canales first.");
  process.exit(1);
}

const me = await graph("me", { token: current, params: { fields: "client_business_id" } });
const clientBusinessId = me.data?.client_business_id;
if (!me.ok || !clientBusinessId) {
  console.error(`Meta didn't give the client's business id: ${me.data?.error?.message ?? "unknown error"}`);
  console.error("(This token may not be a BISU token. Nothing was changed.)");
  process.exit(1);
}
console.log(`Client business id: ${clientBusinessId}`);

if (!mint) {
  console.log("\nRead-only run, nothing changed. Add --mint to try minting a non-expiring token.");
  process.exit(0);
}

const minted = await graph(`${clientBusinessId}/system_user_access_tokens`, {
  token: current,
  method: "POST",
  // No set_token_expires_in_60_days: that's the whole experiment.
  params: { scope: scopes.join(",") },
});
const newToken = minted.data?.access_token;
if (!minted.ok || !newToken) {
  console.error(`Meta refused to mint a token: ${minted.data?.error?.message ?? "unknown error"}`);
  process.exit(1);
}
const newInfo = await debug(newToken);
console.log(`New token: type=${newInfo?.type} valid=${newInfo?.is_valid} expires=${when(newInfo?.expires_at)} data_access_expires=${when(newInfo?.data_access_expires_at)}`);
if (!newInfo?.is_valid) {
  console.error("The new token isn't valid. The channel was not changed.");
  process.exit(1);
}

const { error: saveError } = await supabase
  .from("channels")
  .update({
    access_token_encrypted: encryptSecret(newToken),
    token_expires_at: newInfo.expires_at ? new Date(newInfo.expires_at * 1000).toISOString() : null,
    data_access_expires_at: newInfo.data_access_expires_at
      ? new Date(newInfo.data_access_expires_at * 1000).toISOString()
      : null,
    expiry_warned_at: null,
  })
  .eq("id", channel.id);
if (saveError) {
  console.error(`Couldn't save the new token: ${saveError.message}`);
  process.exit(1);
}
console.log(
  newInfo.expires_at
    ? "\nSaved, but this token still expires: the experiment did NOT give a permanent token."
    : "\nSaved. expires=never: the experiment WORKED. Tell your developer so onboarding can do this automatically.",
);
