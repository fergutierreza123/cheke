import { redirect } from "next/navigation";
import { canManageStore, getCurrentBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { isBillingError } from "@/lib/whatsappErrors";
import { ChannelsView, type BillingProblem, type ChannelItem } from "./ChannelsView";

// How far back a payment failure still counts as a current problem.
const BILLING_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function ChannelsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  // Never select the token columns here — this data goes to the browser.
  const [{ data }, billingProblem] = await Promise.all([
    supabase
      .from("channels")
      .select(
        "id, store_id, type, status, external_id, page_id, display_phone, verified_name, connected_at, coexistence, contacts_sync_requested_at, history_sync_requested_at, history_sync_progress, history_sync_error",
      )
      .eq("business_id", business.id)
      .in("store_id", business.scopeStoreIds),
    findBillingProblem(supabase, business.id, business.scopeStoreIds),
  ]);

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
      channels={(data ?? []) as ChannelItem[]}
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
