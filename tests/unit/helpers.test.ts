import { describe, expect, it, vi } from "vitest";
import type { AuthError } from "@supabase/supabase-js";
import { humanAgentNotice, replyWindow, windowClosedMessage } from "@/lib/messagingWindow";
import { WINDOW_CLOSED_MESSAGE, isWhatsAppWindowClosed } from "@/lib/whatsappWindow";
import { BILLING_ERROR_CODE, explainWhatsAppError, isBillingError, markMessageFailed } from "@/lib/whatsappErrors";
import { formatLocal, formatPhone, isForeignNumber, isHondurasE164, localDigits, toE164 } from "@/lib/auth/phone";
import { USE_EMAIL_INSTEAD, sendErrorMessage, verifyErrorMessage } from "@/lib/auth/errors";
import { formatMessageTime, initialsFor, initialsFromEmail, primaryChannel, productMessageText, relativeTime } from "@/lib/format";
import { countAwaitingReply } from "@/lib/push";
import { getDeletionPlan } from "@/app/(app)/account/deletion";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("firebase-admin/app", () => ({}));
vi.mock("firebase-admin/messaging", () => ({}));

const H = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-16T20:00:00.000Z");
const expiresIn = (ms: number) => new Date(NOW + ms).toISOString();

describe("replyWindow", () => {
  it("is open inside 24 h and when nothing is recorded", () => {
    expect(replyWindow("whatsapp", expiresIn(H), NOW)).toBe("open");
    expect(replyWindow("whatsapp", null, NOW)).toBe("open");
    expect(replyWindow(null, expiresIn(-H), NOW)).toBe("open");
    expect(replyWindow("whatsapp", "garbage", NOW)).toBe("open");
  });

  it("closes WhatsApp after 24 h", () => {
    expect(replyWindow("whatsapp", expiresIn(-1), NOW)).toBe("closed");
  });

  it("gives Instagram/Facebook people 7 days (Human Agent), then closes", () => {
    expect(replyWindow("instagram", expiresIn(-H), NOW)).toBe("human_agent");
    expect(replyWindow("facebook", expiresIn(-6 * 24 * H), NOW)).toBe("human_agent");
    expect(replyWindow("facebook", expiresIn(-6 * 24 * H - 1), NOW)).toBe("closed");
  });

  it("explains each case", () => {
    expect(windowClosedMessage("whatsapp")).toBe(WINDOW_CLOSED_MESSAGE);
    expect(windowClosedMessage("instagram")).toContain("Instagram no permite");
    // WhatsApp points at the way out; Instagram/Facebook have no templates.
    expect(windowClosedMessage("whatsapp")).toContain("Enviar plantilla");
    expect(windowClosedMessage("facebook")).toContain("cuando te vuelva a escribir");
    expect(windowClosedMessage("facebook")).not.toContain("plantilla");
    expect(humanAgentNotice("facebook")).toContain("En Facebook");
    expect(isWhatsAppWindowClosed(expiresIn(-1), NOW)).toBe(true);
    expect(isWhatsAppWindowClosed(null, NOW)).toBe(false);
  });
});

describe("WhatsApp errors", () => {
  it("explains known codes in Spanish", () => {
    expect(explainWhatsAppError(131047)).toContain("24 horas");
    expect(explainWhatsAppError(190)).toContain("Vuelve a conectar WhatsApp");
    expect(explainWhatsAppError(999)).toBe("WhatsApp no entregó este mensaje (código 999).");
    expect(explainWhatsAppError(null)).toBe("WhatsApp no entregó este mensaje.");
  });

  it("detects billing problems", () => {
    expect(isBillingError(BILLING_ERROR_CODE)).toBe(true);
    expect(isBillingError(134011, "payment method")).toBe(false);
    expect(isBillingError(1, "Your Payment Method failed")).toBe(true);
    expect(explainWhatsAppError(1, "credit line over limit")).toContain("método de pago");
  });

  it("marks a message failed, with Meta's reason or cheke's own", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: () => ({ update: (f: unknown) => (updates.push(f), { eq: async () => ({ error: null }) }) }),
    } as never;
    const fromMeta = await markMessageFailed(supabase, "m1", { error: "x", errorCode: 131026 });
    expect(fromMeta.error_reason).toContain("no tiene WhatsApp");
    const local = await markMessageFailed(supabase, "m1", { error: "El canal no está conectado." });
    expect(local).toMatchObject({ status: "failed", error_code: null, error_reason: "El canal no está conectado." });
    expect(updates).toHaveLength(2);
  });
});

describe("Honduran phone login", () => {
  it("reads 8 local digits from whatever was typed", () => {
    expect(localDigits("9999-9999")).toBe("99999999");
    expect(localDigits("+504 9999 9999")).toBe("99999999");
    expect(localDigits("9999-999")).toBeNull();
    expect(localDigits("+1 555 123 4567")).toBeNull();
  });

  it("spots foreign numbers", () => {
    expect(isForeignNumber("+1 555")).toBe(true);
    expect(isForeignNumber("+504 9999")).toBe(false);
    expect(isForeignNumber("123456789")).toBe(true);
    expect(isForeignNumber("50499999999")).toBe(false);
  });

  it("formats numbers", () => {
    expect(toE164("99999999")).toBe("+50499999999");
    expect(isHondurasE164("+50499999999")).toBe(true);
    expect(isHondurasE164("+5049999999")).toBe(false);
    expect(formatLocal("999999")).toBe("9999-99");
    expect(formatPhone("50499999999")).toBe("+504 9999-9999");
    expect(formatPhone("15551234567")).toBe("+15551234567");
    expect(formatPhone(null)).toBe("");
  });
});

describe("auth error messages", () => {
  const err = (e: Partial<AuthError>) => ({ message: "", ...e }) as AuthError;
  it("never shows raw English", () => {
    expect(sendErrorMessage(err({ status: 429 }), "phone")).toMatch(/Espera un minuto/);
    expect(sendErrorMessage(err({ message: "Database error saving new user" }), "phone")).toBe(USE_EMAIL_INSTEAD);
    expect(sendErrorMessage(err({ code: "email_address_invalid" }), "email")).toMatch(/correo no parece correcto/);
    expect(sendErrorMessage(err({ message: "weird" }), "email")).toBe("No pudimos enviar el código. Inténtalo de nuevo.");
    expect(verifyErrorMessage(err({ code: "otp_expired" }))).toMatch(/ya venció/);
    expect(verifyErrorMessage(err({ status: 429 }))).toMatch(/Demasiados intentos/);
  });
});

describe("format", () => {
  it("builds initials", () => {
    expect(initialsFor("marielos zúniga")).toBe("MZ");
    expect(initialsFromEmail("ana.lopez@x.hn")).toBe("AL");
    expect(initialsFromEmail("+504 9999-9912")).toBe("12");
    expect(initialsFromEmail(null)).toBe("?");
  });

  it("formats times without the odd es-HN space", () => {
    const d = new Date(2026, 9, 16, 0, 5);
    expect(formatMessageTime(d.toISOString())).toBe("12:05 a.m.");
    expect(formatMessageTime(new Date(2026, 9, 16, 13, 7).toISOString())).toBe("1:07 p.m.");
  });

  it("says how long ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(relativeTime(null)).toBe("");
    expect(relativeTime(new Date(NOW - 30_000).toISOString())).toBe("ahora");
    expect(relativeTime(new Date(NOW - 5 * 60_000).toISOString())).toBe("hace 5 min");
    expect(relativeTime(new Date(NOW - 24 * H).toISOString())).toBe("hace 1 día");
    expect(relativeTime(new Date(NOW - 60 * 24 * H).toISOString())).toBe("hace 2 meses");
    vi.useRealTimers();
  });

  it("picks the primary channel and builds product text", () => {
    expect(primaryChannel({ phone: null, ig_handle: "@a", fb_id: "b" })).toBe("instagram");
    expect(primaryChannel({ phone: null, ig_handle: null, fb_id: null })).toBeNull();
    expect(productMessageText({ name: "Blusa", price_hnl: 300, description: null }, " ¡Oferta! ")).toBe("Blusa — L 300\n¡Oferta!");
  });
});

describe("countAwaitingReply", () => {
  it("counts conversations whose latest message is from the customer", () => {
    expect(
      countAwaitingReply([
        { conversation_id: "a", direction: "in" },
        { conversation_id: "b", direction: "out" },
        { conversation_id: "a", direction: "out" },
        { conversation_id: "b", direction: "in" },
        { conversation_id: "c", direction: "in" },
      ]),
    ).toBe(2);
  });
});

describe("getDeletionPlan", () => {
  function fake(memberships: unknown[], roster: unknown[]) {
    let call = 0;
    const chain = { select: () => chain, eq: () => chain, in: () => chain, then: (r: (v: unknown) => void) => r({ data: call++ === 0 ? memberships : roster, error: null }) };
    return { from: () => chain } as never;
  }

  it("deletes a Negocio you are alone in, blocks the only Dueño of a team, lets others leave", async () => {
    const plan = await getDeletionPlan(
      fake(
        [
          { business_id: "solo", role: "owner", businesses: { name: "Solo" } },
          { business_id: "team", role: "owner", businesses: [{ name: "Equipo" }] },
          { business_id: "shared", role: "agent", businesses: null },
        ],
        [
          { business_id: "solo", user_id: "me", role: "owner" },
          { business_id: "team", user_id: "me", role: "owner" },
          { business_id: "team", user_id: "x", role: "agent" },
          { business_id: "shared", user_id: "me", role: "agent" },
          { business_id: "shared", user_id: "y", role: "owner" },
        ],
      ),
      "me",
    );
    expect(plan).toEqual([
      { businessId: "solo", businessName: "Solo", outcome: "delete" },
      { businessId: "team", businessName: "Equipo", outcome: "blocked" },
      { businessId: "shared", businessName: "tu negocio", outcome: "leave" },
    ]);
  });
});
