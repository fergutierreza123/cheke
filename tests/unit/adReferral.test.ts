import { describe, expect, it } from "vitest";
import { metaReferral, referralLabel, whatsappReferral } from "@/lib/adReferral";
import { adCounts } from "@/lib/analytics";

// Payloads copied from Meta's docs (see the links in src/lib/adReferral.ts).

// WhatsApp Cloud API, "Click to WhatsApp ad" example (messages[0]).
const ctwaMessage = {
  referral: {
    source_url: "https://fb.me/3cr4Wqqkv",
    source_id: "120226305854810726",
    source_type: "ad",
    body: "Summer Succulents are here!",
    headline: "Chat with us",
    media_type: "image",
    image_url: "https://scontent.xx.fbcdn.net/v/t45.1...",
    ctwa_clid: "Aff-n8ZTODiE79d22KtAwQKj9e_mIEOOj27vDVwFjN80dp4_0NiNhEgpGo0AHemvuSoifXaytfTzcchptiErTKCqTrJ5nW1h7IHYeYymGb5K5J5iTROpBhWAGaIAeUzHL50",
    welcome_message: { text: "Hi there! Let us know how we can help!" },
  },
  from: "16505551234",
  id: "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQUQ0N0VFMDA2MTQ0RkJFNkNDNAA=",
  timestamp: "1750275992",
  text: { body: "Can I get more info about this?" },
  type: "text",
};

// Messenger messaging_referrals / Instagram message.referral (ads_context_data).
const adsReferral = {
  ref: "promo-oct",
  ad_id: "6045246247433",
  source: "ADS",
  type: "OPEN_THREAD",
  ads_context_data: {
    ad_title: "Zapatos 2x1",
    photo_url: "https://scontent.xx.fbcdn.net/photo.jpg",
    post_id: "1234_5678",
  },
};

describe("whatsappReferral", () => {
  it("reads a Click-to-WhatsApp ad", () => {
    expect(whatsappReferral(ctwaMessage)).toEqual({
      source: "anuncio",
      adId: "120226305854810726",
      headline: "Chat with us",
      url: "https://fb.me/3cr4Wqqkv",
      raw: ctwaMessage.referral,
    });
  });

  it("a post, an ad without headline (uses its text), and a non-https link", () => {
    const r = whatsappReferral({ referral: { source_type: "post", source_id: "9", body: "Llegó mercadería", source_url: "javascript:alert(1)" } });
    expect(r).toMatchObject({ source: "publicación", headline: "Llegó mercadería", url: null });
  });

  it("an ordinary message has no ad", () => {
    expect(whatsappReferral({})).toBeNull();
    expect(whatsappReferral({ referral: { source_type: "other" } })).toBeNull();
  });
});

describe("metaReferral", () => {
  it("Instagram: on the message", () => {
    expect(metaReferral({ message: { referral: adsReferral } })).toEqual({
      source: "anuncio",
      adId: "6045246247433",
      headline: "Zapatos 2x1",
      url: null,
      raw: adsReferral,
    });
  });

  it("Messenger: on its own, or on a Get Started postback", () => {
    expect(metaReferral({ referral: adsReferral })?.adId).toBe("6045246247433");
    expect(metaReferral({ postback: { referral: adsReferral } })?.adId).toBe("6045246247433");
  });

  it("an m.me / ig.me link is not an ad", () => {
    expect(metaReferral({ referral: { source: "SHORTLINK" } })).toBeNull();
    expect(metaReferral({ message: {} })).toBeNull();
  });
});

describe("referralLabel", () => {
  it("says where the chat came from", () => {
    expect(referralLabel({ referral_source: "anuncio", referral_headline: "Zapatos 2x1" })).toBe("Vino de un anuncio: Zapatos 2x1");
    expect(referralLabel({ referral_source: "publicación" })).toBe("Vino de una publicación");
    expect(referralLabel({})).toBeNull();
  });
});

describe("adCounts", () => {
  it("counts chats and sales per ad since the period start", () => {
    const at = "2026-10-20T10:00:00Z";
    const rows = [
      { referral_source: "anuncio", referral_ad_id: "A", referral_headline: "Zapatos", referral_at: at, stage: "ganado" },
      { referral_source: "anuncio", referral_ad_id: "A", referral_headline: "Zapatos", referral_at: at, stage: "nuevo" },
      { referral_source: "anuncio", referral_ad_id: "B", referral_headline: null, referral_at: at, stage: "nuevo" },
      { referral_source: "anuncio", referral_ad_id: "A", referral_headline: "Zapatos", referral_at: "2026-09-01T00:00:00Z", stage: "nuevo" },
      { stage: "nuevo" },
    ];
    expect(adCounts(rows, Date.parse("2026-10-01T00:00:00Z"))).toEqual([
      { label: "Zapatos", chats: 2, won: 1 },
      { label: "Anuncio sin título", chats: 1, won: 0 },
    ]);
  });
});
