import { redirect } from "next/navigation";
import { canManageStore, getCurrentBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { isBillingError } from "@/lib/whatsappErrors";
import { daysLeft, EXPIRY_WARNING_DAYS } from "@/lib/metaTokens";
import { ChannelsView, type BillingProblem, type ChannelItem } from "./ChannelsView";

// How far back a payment failure still counts as a current problem.
const BILLING_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function ChannelsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  const [rows, billingProblem] = await Promise.all([
    loadChannels(supabase, business.id, business.scopeStoreIds),
    findBillingProblem(supabase, business.id, business.scopeStoreIds),
  ]);
  // WhatsApp sends with cheke's never-ending system-user token when it's set
  // (src/lib/whatsapp.ts), so its own token's end date doesn't matter then.
  const whatsappTokenManaged = Boolean(process.env.META_SYSTEM_USER_TOKEN?.trim());
  const data = rows.map((row) => withReconnectState(row, whatsappTokenManaged));

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  // The connect button only works once Meta's app, the Embedded Signup
  // configuration and the encryption key are all set.
  const metaReady = Boolean(appId && configId && process.env.WHATSAPP_APP_SECRET && process.env.CHANNEL_TOKEN_KEY);
  // Instagram + Facebook use a second login configuration on the same app.
  const messagingConfigId = process.env.NEXT_PUBLIC_META_MESSAGING_CONFIG_ID;
  const messagingReady = Boolean(
    appId && messagingConfigId && process.env.WHATSAPP_APP_SECRET && process.env.CHANNEL_TOKEN_KEY,
  );

  return (
    <ChannelsView
      channels={data}
      // Listed by Tienda in "Todas las tiendas"; one untitled block otherwise.
      sections={business.scopeStoreIds.map((id) => ({
        storeId: id,
        name: business.allStores.find((s) => s.id === id)?.name ?? "",
        canManage: canManageStore(business, id) && !business.allStores.find((s) => s.id === id)?.archived,
      }))}
      isOwner={business.role === "owner"}
      meta={metaReady ? { appId: appId!, configId: configId! } : null}
      messaging={messagingReady ? { appId: appId!, configId: messagingConfigId! } : null}
      billingProblem={billingProblem}
    />
  );
}

// Never select the token columns here — this data goes to the browser.
const CHANNEL_COLUMNS =
  "id, store_id, type, status, external_id, page_id, display_phone, verified_name, connected_at, coexistence, contacts_sync_requested_at, history_sync_requested_at, history_sync_progress, history_sync_error";
// Migration 0029 (issue #56): token end date and the "Reconectar" state.
const HEALTH_COLUMNS = "token_expires_at, reauth_required_at";

type ChannelRow = Omit<ChannelItem, "reconnect" | "reconnectDays"> & {
  token_expires_at?: string | null;
  reauth_required_at?: string | null;
};

async function loadChannels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  storeIds: string[],
): Promise<ChannelRow[]> {
  const query = (columns: string) =>
    supabase.from("channels").select(columns).eq("business_id", businessId).in("store_id", storeIds);
  const withHealth = await query(`${CHANNEL_COLUMNS}, ${HEALTH_COLUMNS}`);
  if (!withHealth.error) return (withHealth.data ?? []) as unknown as ChannelRow[];
  // Migration 0029 not applied yet: show Canales as before.
  const plain = await query(CHANNEL_COLUMNS);
  return (plain.data ?? []) as unknown as ChannelRow[];
}

// "Reconectar" when Meta refused the token; "soon" when it ends within
// EXPIRY_WARNING_DAYS (and the Canal really depends on it).
function withReconnectState(row: ChannelRow, whatsappTokenManaged: boolean): ChannelItem {
  const { token_expires_at, reauth_required_at, ...item } = row;
  if (item.status !== "connected") return { ...item, reconnect: null };
  if (reauth_required_at) return { ...item, reconnect: "required" };
  if (!token_expires_at || (item.type === "whatsapp" && whatsappTokenManaged)) return { ...item, reconnect: null };
  const now = Date.now();
  const ends = new Date(token_expires_at).getTime();
  if (ends <= now) return { ...item, reconnect: "required" };
  if (ends - now > EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000) return { ...item, reconnect: null };
  return { ...item, reconnect: "soon", reconnectDays: daysLeft(token_expires_at, now) };
}

// Messages WhatsApp refused in the last week because of the business's Meta
// billing (no card, card declined...). Since Oct 1, 2026 that's what happens
// to every reply after the 1,000 free ones of the month when there's no card.
async function findBillingProblem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  storeIds: string[],
): Promise<BillingProblem | null> {
  if (storeIds.length === 0) return null;
  const since = new Date(Date.now() - BILLING_LOOKBACK_MS).toISOString();
  const { data, error } = await supabase
    .from("messages")
    .select("created_at, error_code, error_details")
    .eq("business_id", businessId)
    .in("store_id", storeIds)
    .eq("status", "failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  // An error here means migration 0017 hasn't been run yet: show no banner.
  if (error || !data) return null;

  const failures = data.filter((m) => isBillingError(m.error_code, m.error_details));
  if (failures.length === 0) return null;
  const lastAt = failures[0].created_at;

  // A reply delivered after the last payment failure means it's fixed
  // (card added, or a new month's free replies): no need to warn.
  const { data: deliveredSince } = await supabase
    .from("messages")
    .select("id")
    .eq("business_id", businessId)
    .in("store_id", storeIds)
    .eq("direction", "out")
    .in("status", ["delivered", "read"])
    .gt("created_at", lastAt)
    .limit(1);
  if (deliveredSince?.length) return null;

  return { count: failures.length, lastAt };
}
