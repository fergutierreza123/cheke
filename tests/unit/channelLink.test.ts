import { describe, expect, it } from "vitest";
import { channelLink, DEFAULT_LINK_MESSAGE } from "@/lib/channelLink";

const base = { display_phone: null, page_id: null, verified_name: null };

describe("channelLink", () => {
  it("WhatsApp: keeps only the number's digits and encodes the first message", () => {
    expect(channelLink({ ...base, type: "whatsapp", display_phone: "+504 9100-1214" }, "Hola, ¿precio & envío?")).toBe(
      "https://wa.me/50491001214?text=Hola%2C%20%C2%BFprecio%20%26%20env%C3%ADo%3F",
    );
  });

  it("WhatsApp: uses the default message, and drops ?text= when it's empty", () => {
    expect(channelLink({ ...base, type: "whatsapp", display_phone: "+50491001214" })).toBe(
      `https://wa.me/50491001214?text=${encodeURIComponent(DEFAULT_LINK_MESSAGE)}`,
    );
    expect(channelLink({ ...base, type: "whatsapp", display_phone: "+50491001214" }, "   ")).toBe("https://wa.me/50491001214");
  });

  it("WhatsApp: no link without a number", () => {
    expect(channelLink({ ...base, type: "whatsapp" })).toBeNull();
    expect(channelLink({ ...base, type: "whatsapp", display_phone: "Número de prueba" })).toBeNull();
  });

  it("Instagram: ig.me/m with the username, without @, ignoring the message", () => {
    expect(channelLink({ ...base, type: "instagram", verified_name: "@tienda.luna_hn" }, "Hola")).toBe(
      "https://ig.me/m/tienda.luna_hn",
    );
    expect(channelLink({ ...base, type: "instagram", verified_name: null })).toBeNull();
    expect(channelLink({ ...base, type: "instagram", verified_name: "Tienda Luna" })).toBeNull();
  });

  it("Facebook: m.me with the Page id", () => {
    expect(channelLink({ ...base, type: "facebook", page_id: "1234567890" })).toBe("https://m.me/1234567890");
    expect(channelLink({ ...base, type: "facebook", page_id: null })).toBeNull();
  });
});
