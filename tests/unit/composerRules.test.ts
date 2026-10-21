import { describe, expect, it } from "vitest";
import { composerRules } from "@/lib/composerRules";

// What the Chat composer lets a person do, per network, reply window and
// Modo prueba: which buttons work, and what the (always visible) mic says
// when nothing but a Plantilla can go out.
describe("composer rules", () => {
  it("WhatsApp inside 24 h: voice notes, photos and documents all work", () => {
    const rules = composerRules({ channelType: "whatsapp", replyState: "open", simulateMode: false });
    expect(rules).toMatchObject({ canSendText: true, canSendMedia: true, mediaBlockedReason: null, approvedTemplateOnly: false });
  });

  it("WhatsApp after 24 h: the mic explains Meta only allows a Plantilla, and offers «Enviar plantilla»", () => {
    const rules = composerRules({ channelType: "whatsapp", replyState: "closed", simulateMode: false });
    expect(rules.canSendMedia).toBe(false);
    expect(rules.canSendText).toBe(false);
    expect(rules.approvedTemplateOnly).toBe(true);
    expect(rules.mediaBlockedReason).toMatch(/24 horas/);
    expect(rules.mediaBlockedReason).toMatch(/Enviar plantilla/);
    // Without Coexistence the phone app isn't connected to this number.
    expect(rules.mediaBlockedReason).not.toMatch(/teléfono/);
  });

  it("WhatsApp after 24 h with Coexistence: also says the phone's WhatsApp Business app still can", () => {
    const rules = composerRules({ channelType: "whatsapp", coexistence: true, replyState: "closed", simulateMode: false });
    expect(rules.mediaBlockedReason).toMatch(/Enviar plantilla/);
    expect(rules.mediaBlockedReason).toMatch(/app WhatsApp Business de tu teléfono/);
  });

  it("Instagram and Messenger between 24 h and 7 days: a person still sends voice notes and photos, like text", () => {
    for (const channelType of ["instagram", "facebook"] as const) {
      const rules = composerRules({ channelType, replyState: "human_agent", simulateMode: false });
      expect(rules).toMatchObject({ canSendText: true, canSendMedia: true, mediaBlockedReason: null, approvedTemplateOnly: false });
    }
  });

  it("Instagram after 7 days: nothing goes out, and the mic says why", () => {
    const rules = composerRules({ channelType: "instagram", replyState: "closed", simulateMode: false });
    expect(rules).toMatchObject({ canSendText: false, canSendMedia: false, approvedTemplateOnly: false });
    expect(rules.mediaBlockedReason).toMatch(/7 días/);
  });

  it("Modo prueba: voice notes, photos and documents work as the customer, even in a closed chat", () => {
    for (const replyState of ["open", "closed"] as const) {
      const rules = composerRules({ channelType: "whatsapp", replyState, simulateMode: true });
      expect(rules).toMatchObject({ canSendText: true, canSendMedia: true, mediaBlockedReason: null, asCustomer: true });
      // The business's own tools (Cobrar, Ubicación, reactions) aren't the customer's.
      expect(rules.businessTools).toBe(false);
    }
  });
});
