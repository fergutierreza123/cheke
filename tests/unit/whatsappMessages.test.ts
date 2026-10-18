import { describe, expect, it } from "vitest";
import { describeMessage, whatsappMedia, type WhatsAppMessage } from "@/lib/whatsappMessages";

const base = { id: "wamid.1", from: "50499999999", timestamp: "1700000000" };
const msg = (m: Partial<WhatsAppMessage> & { type: string }): WhatsAppMessage => ({ ...base, ...m });

describe("describeMessage", () => {
  it("keeps plain text as is", () => {
    expect(describeMessage(msg({ type: "text", text: { body: "Hola" } }))).toBe("Hola");
    expect(describeMessage(msg({ type: "text" }))).toBe("");
  });

  it("labels photos and videos, with the caption when there is one", () => {
    expect(describeMessage(msg({ type: "image", image: { id: "1" } }))).toBe("📷 Foto");
    expect(describeMessage(msg({ type: "image", image: { id: "1", caption: "¿Esta?" } }))).toBe("📷 ¿Esta?");
    expect(describeMessage(msg({ type: "video", video: {} }))).toBe("🎥 Video");
    expect(describeMessage(msg({ type: "video", video: { caption: "mire" } }))).toBe("🎥 mire");
  });

  it("labels audio, documents and stickers", () => {
    expect(describeMessage(msg({ type: "audio", audio: { voice: true } }))).toBe("🎤 Nota de voz");
    expect(describeMessage(msg({ type: "document", document: { filename: "factura.pdf" } }))).toBe("📄 factura.pdf");
    expect(describeMessage(msg({ type: "document", document: { caption: "recibo" } }))).toBe("📄 recibo");
    expect(describeMessage(msg({ type: "document" }))).toBe("📄 Documento");
    expect(describeMessage(msg({ type: "sticker", sticker: {} }))).toBe("Sticker");
  });

  it("describes locations with name and address", () => {
    expect(describeMessage(msg({ type: "location", location: { name: "Mall", address: "Tegus" } }))).toBe("📍 Mall, Tegus");
    expect(describeMessage(msg({ type: "location", location: { latitude: 1, longitude: 2 } }))).toBe("📍 Ubicación");
  });

  it("names shared contacts", () => {
    const m = msg({
      type: "contacts",
      contacts: [{ name: { formatted_name: "Ana" } }, { name: { formatted_name: "Luis" } }],
    });
    expect(describeMessage(m)).toBe("👤 Ana, Luis");
    expect(describeMessage(msg({ type: "contacts", contacts: [] }))).toBe("👤 Contacto compartido");
  });

  it("uses the tapped button or list title", () => {
    expect(describeMessage(msg({ type: "button", button: { text: "Sí" } }))).toBe("Sí");
    expect(describeMessage(msg({ type: "interactive", interactive: { button_reply: { title: "Comprar" } } }))).toBe("Comprar");
    expect(describeMessage(msg({ type: "interactive", interactive: { list_reply: { title: "Talla M" } } }))).toBe("Talla M");
  });

  it("hides reactions and explains unknown types", () => {
    expect(describeMessage(msg({ type: "reaction" }))).toBeNull();
    expect(describeMessage(msg({ type: "media_placeholder" }))).toBe("📎 Archivo del historial");
    expect(describeMessage(msg({ type: "ephemeral" }))).toMatch(/todavía no puede mostrar/);
  });
});

describe("whatsappMedia", () => {
  it("returns nothing for text", () => {
    expect(whatsappMedia(msg({ type: "text", text: { body: "x" } }))).toBeNull();
  });

  it("carries the media id and caption of photos", () => {
    expect(whatsappMedia(msg({ type: "image", image: { id: "M1", caption: "c" } }))).toEqual({
      kind: "image",
      info: { caption: "c" },
      mediaId: "M1",
    });
    expect(whatsappMedia(msg({ type: "sticker", sticker: { id: "S" } }))).toEqual({ kind: "sticker", info: {}, mediaId: "S" });
  });

  it("tells voice notes from other audio", () => {
    expect(whatsappMedia(msg({ type: "audio", audio: { id: "A", voice: true } }))?.kind).toBe("voice");
    expect(whatsappMedia(msg({ type: "audio", audio: { id: "A" } }))?.kind).toBe("audio");
  });

  it("keeps a document's file name", () => {
    expect(whatsappMedia(msg({ type: "document", document: { id: "D", filename: "a.pdf" } }))).toEqual({
      kind: "document",
      info: { filename: "a.pdf" },
      mediaId: "D",
    });
  });

  it("needs numeric coordinates for a location", () => {
    expect(whatsappMedia(msg({ type: "location", location: { name: "x" } }))).toBeNull();
    expect(whatsappMedia(msg({ type: "location", location: { latitude: 14.1, longitude: -87.2, name: "Mall" } }))).toEqual({
      kind: "location",
      info: { latitude: 14.1, longitude: -87.2, place: "Mall" },
    });
  });

  it("lists contact cards with their phones", () => {
    const m = msg({
      type: "contacts",
      contacts: [{ phones: [{ phone: "+504 1" }, { wa_id: "5042" }, {}] }],
    });
    expect(whatsappMedia(m)).toEqual({ kind: "contacts", info: { contacts: [{ name: "Contacto", phones: ["+504 1", "5042"] }] } });
  });
});
