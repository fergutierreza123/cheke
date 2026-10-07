import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { ChannelsView, type ChannelItem } from "./ChannelsView";

export default async function ChannelsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  // Never select the token columns here — this data goes to the browser.
  const { data } = await supabase
    .from("channels")
    .select("id, type, status, external_id, display_phone, verified_name, connected_at")
    .eq("business_id", business.id);

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  // The connect button only works once Meta's app, the Embedded Signup
  // configuration and the encryption key are all set.
  const metaReady = Boolean(appId && configId && process.env.WHATSAPP_APP_SECRET && process.env.CHANNEL_TOKEN_KEY);

  return (
    <ChannelsView
      channels={(data ?? []) as ChannelItem[]}
      isOwner={business.role === "owner"}
      meta={metaReady ? { appId: appId!, configId: configId! } : null}
    />
  );
}
