import type { SupabaseClient } from "@supabase/supabase-js";

// Which ad (or post) a chat came from: Meta puts a `referral` object on the
// first message a customer sends after tapping a "Enviar mensaje" ad.
//
// WhatsApp (messages[].referral):
// https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text
// Messenger (messaging[].referral, message.referral):
// https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messaging_referrals
// Instagram (messaging[].message.referral):
// https://developers.facebook.com/docs/instagram-platform/webhooks/examples
//
// The webhooks save it with saveReferral().

export type AdSource = "anuncio" | "publicación";

export type AdReferral = {
  source: AdSource;
  adId: string | null;
  headline: string | null;
  url: string | null;
  raw: Record<string, unknown>;
};

export type WhatsAppReferral = {
  source_url?: string;
  source_id?: string;
  source_type?: string; // "ad" | "post"
  headline?: string;
  body?: string;
};

export type MetaReferral = {
  ad_id?: string;
  source?: string; // "ADS" for ads; ig.me / m.me links are not ads
  ads_context_data?: { ad_title?: string; photo_url?: string; video_url?: string; post_id?: string };
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export function whatsappReferral(message: { referral?: WhatsAppReferral }): AdReferral | null {
  const r = message.referral;
  if (!r || (r.source_type !== "ad" && r.source_type !== "post")) return null;
  return {
    source: r.source_type === "ad" ? "anuncio" : "publicación",
    adId: text(r.source_id),
    // Some ads have no headline: the ad's main text says what it was.
    headline: text(r.headline) ?? text(r.body),
    // Shown as a link in Chat: only real web links.
    url: /^https:\/\//i.test(r.source_url ?? "") ? text(r.source_url) : null,
    raw: r as Record<string, unknown>,
  };
}

// Instagram and Messenger: on the message (new chat), on a postback (Get
// Started button), or on its own (the customer already had a chat open).
export function metaReferral(event: {
  referral?: MetaReferral;
  message?: { referral?: MetaReferral };
  postback?: { referral?: MetaReferral };
}): AdReferral | null {
  const r = event.message?.referral ?? event.postback?.referral ?? event.referral;
  if (!r || r.source !== "ADS") return null;
  return {
    source: "anuncio",
    adId: text(r.ad_id),
    headline: text(r.ads_context_data?.ad_title),
    url: null,
    raw: r as Record<string, unknown>,
  };
}

// Chat's line: "Vino de un anuncio: Promo zapatos". Null when not from an ad.
export function referralLabel(c: { referral_source?: AdSource | null; referral_headline?: string | null }): string | null {
  if (!c.referral_source) return null;
  const base = c.referral_source === "anuncio" ? "Vino de un anuncio" : "Vino de una publicación";
  return c.referral_headline ? `${base}: ${c.referral_headline}` : base;
}

// First ad wins: a later ad click doesn't overwrite where the chat started.
export async function saveReferral(supabase: SupabaseClient, conversationId: string, referral: AdReferral, at: string) {
  await supabase
    .from("conversations")
    .update({
      referral: referral.raw,
      referral_source: referral.source,
      referral_ad_id: referral.adId,
      referral_headline: referral.headline,
      referral_url: referral.url,
      referral_at: at,
    })
    .eq("id", conversationId)
    .is("referral", null);
}
