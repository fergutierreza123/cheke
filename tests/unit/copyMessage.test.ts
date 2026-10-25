import { describe, expect, it } from "vitest";
import { copyableText } from "@/lib/copyMessage";
import type { Message } from "@/lib/types";

const msg = (extra: Partial<Message>): Message => ({
  id: "m1",
  conversation_id: "c1",
  business_id: "b1",
  direction: "in",
  body: null,
  media_url: null,
  status: "delivered",
  is_bot: false,
  created_at: "2026-10-18T10:00:00Z",
  ...extra,
});

describe("copyableText", () => {
  it("copies a text message as written", () => {
    expect(copyableText(msg({ body: "BAC 7300-1122-33\nTienda Luna" }))).toBe("BAC 7300-1122-33\nTienda Luna");
  });

  it("copies a photo's or document's caption, not the «📷 Foto» placeholder", () => {
    expect(copyableText(msg({ body: "📷 Así queda", media_kind: "image", media_info: { caption: "Así queda" } }))).toBe(
      "Así queda",
    );
    expect(copyableText(msg({ body: "📷 Foto", media_kind: "image", media_info: {} }))).toBeNull();
  });

  it("copies a voice note's transcription when there is one", () => {
    expect(copyableText(msg({ body: "🎤 Nota de voz", media_kind: "voice", transcription: "¿Tienen talla M?" }))).toBe(
      "¿Tienen talla M?",
    );
    expect(copyableText(msg({ body: "🎤 Nota de voz", media_kind: "voice" }))).toBeNull();
  });

  it("copies a location as its place and address, or its coordinates", () => {
    expect(
      copyableText(
        msg({ media_kind: "location", media_info: { latitude: 14.07, longitude: -87.19, place: "Casa", address: "Col. Kennedy" } }),
      ),
    ).toBe("Casa, Col. Kennedy");
    expect(copyableText(msg({ media_kind: "location", media_info: { latitude: 14.07, longitude: -87.19 } }))).toBe(
      "14.07, -87.19",
    );
  });

  it("copies the Tienda's location the way the customer got it: name, address and the Maps link", () => {
    // What «Ubicación» / chekelin save (src/lib/storeLocation.ts locationSendPlan).
    const sent = msg({
      direction: "out",
      body: "📍 Tienda Luna\nCol. Palmira\nhttps://www.google.com/maps/@14.07,-87.19,17z",
      media_kind: "location",
      media_info: { latitude: 14.07, longitude: -87.19, place: "Tienda Luna", address: "Col. Palmira" },
    });
    expect(copyableText(sent)).toBe("Tienda Luna\nCol. Palmira\nhttps://www.google.com/maps/@14.07,-87.19,17z");
    // Instagram/Messenger get it as plain text: copied as written.
    expect(copyableText(msg({ direction: "out", body: "📍 Tienda Luna\nCol. Palmira\nhttps://maps.app.goo.gl/x" }))).toBe(
      "📍 Tienda Luna\nCol. Palmira\nhttps://maps.app.goo.gl/x",
    );
  });

  it("copies a contact card's names and numbers", () => {
    expect(
      copyableText(msg({ media_kind: "contacts", media_info: { contacts: [{ name: "Repartidor", phones: ["+504 9999-0000"] }] } })),
    ).toBe("Repartidor: +504 9999-0000");
  });

  it("offers nothing for a deleted or empty message", () => {
    expect(copyableText(msg({ body: "hola", deleted_at: "2026-10-18T11:00:00Z" }))).toBeNull();
    expect(copyableText(msg({ body: "   " }))).toBeNull();
  });
});
