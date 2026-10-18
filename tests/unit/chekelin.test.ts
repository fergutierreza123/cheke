import { describe, expect, it, vi } from "vitest";

// bot.ts pulls in the push and Supabase admin modules; the routing decision
// tested here never touches them.
vi.mock("@/lib/push", () => ({ notifyConversation: vi.fn(), sendPushToPeople: vi.fn() }));

import { HANDOFF_REASON_LABEL, planFor, type Knowledge, type LoadedConversation } from "@/lib/bot";
import { normalizeSeller, type SellerDecision } from "@/lib/ai";
import {
  CHEKELIN_OFF_FOREVER,
  chekelinChatState,
  chekelinOffLabel,
  chekelinOffUntil,
  firstNameOf,
  handoffLine,
  humanDelayMs,
  isChekelinOff,
  secondMessageDelayMs,
  stageAfterChekelin,
  waitNoticeLine,
} from "@/lib/chekelinState";
import { DEFAULT_NAV_ITEMS } from "@/components/Sidebar";
import { EMPTY_CHEKELIN_INFO } from "@/lib/types";

const NOW = Date.parse("2026-10-16T20:00:00.000Z"); // 2:00 p. m. in Honduras

describe("chekelin switch", () => {
  it("computes when each 'apagar' option ends", () => {
    expect(chekelinOffUntil("1h", NOW)).toBe("2026-10-16T21:00:00.000Z");
    expect(chekelinOffUntil("1w", NOW)).toBe("2026-10-23T20:00:00.000Z");
    expect(chekelinOffUntil("forever", NOW)).toBe(CHEKELIN_OFF_FOREVER);
    // Tomorrow 7:00 a. m. Honduras = 13:00 UTC.
    expect(chekelinOffUntil("tomorrow", NOW)).toBe("2026-10-17T13:00:00.000Z");
    // Just before midnight in Honduras (05:59 UTC next day) is still "today".
    expect(chekelinOffUntil("tomorrow", Date.parse("2026-10-17T05:59:00.000Z"))).toBe("2026-10-17T13:00:00.000Z");
  });

  it("knows whether it is off", () => {
    expect(isChekelinOff(null, NOW)).toBe(false);
    expect(isChekelinOff("2026-10-16T19:00:00.000Z", NOW)).toBe(false);
    expect(isChekelinOff("2026-10-16T21:00:00.000Z", NOW)).toBe(true);
    expect(isChekelinOff("garbage", NOW)).toBe(false);
  });

  it("labels the switch", () => {
    expect(chekelinOffLabel(CHEKELIN_OFF_FOREVER, NOW)).toBe("Apagado hasta que lo actives");
    expect(chekelinOffLabel("2026-10-16T20:30:00.000Z", NOW)).toBe("Apagado 30 min más");
    expect(chekelinOffLabel("2026-10-16T22:00:00.000Z", NOW)).toMatch(/^Apagado hasta /);
  });
});

describe("chekelinChatState", () => {
  const base = { available: true, storeOffUntil: null, botEnabled: true, handedOffAt: null, nowMs: NOW };
  it("follows the priority off > complaint > paused > silent > active", () => {
    expect(chekelinChatState(base)).toBe("active");
    expect(chekelinChatState({ ...base, handedOffAt: "x" })).toBe("silent");
    expect(chekelinChatState({ ...base, botEnabled: false, handedOffAt: "x" })).toBe("paused");
    expect(chekelinChatState({ ...base, botEnabled: false, complaintOpenAt: "x" })).toBe("complaint");
    expect(chekelinChatState({ ...base, complaintOpenAt: "x", available: false })).toBe("off");
    expect(chekelinChatState({ ...base, storeOffUntil: CHEKELIN_OFF_FOREVER })).toBe("off");
  });
});

describe("customer-facing timing and lines", () => {
  it("types for 3 to 10 seconds, minus time already spent", () => {
    expect(humanDelayMs("hola")).toBe(3_000);
    expect(humanDelayMs("x".repeat(1000))).toBe(10_000);
    expect(humanDelayMs("hola", 5_000)).toBe(0);
    expect(secondMessageDelayMs("")).toBe(1_500);
    expect(secondMessageDelayMs("x".repeat(1000))).toBe(4_000);
  });

  it("names the person who takes over", () => {
    expect(firstNameOf("  María José ")).toBe("María");
    expect(firstNameOf("")).toBeNull();
    expect(handoffLine("María")).toContain("Te paso con María");
    expect(handoffLine(null)).toContain("alguien del equipo");
    expect(handoffLine(null, "confirm")).toMatch(/^Alguien del equipo te escribe/);
    expect(waitNoticeLine(null)).toContain("al equipo");
  });
});

describe("normalizeSeller", () => {
  it("cleans what the model returned", () => {
    const d = normalizeSeller({
      messages: [" hola ", "", "dos", "tres"],
      product_refs: ["P1", "x", "P2", "P3", "P4"],
      order: { items: [{ product: "A", details: "", quantity: 0, unit_price_hnl: 1 }], shipping_hnl: "50" as never },
    } as never);
    expect(d.messages).toEqual(["hola", "dos"]);
    expect(d.productRefs).toEqual(["P1", "P2", "P3"]);
    expect(d.action).toBe("none");
    expect(d.handoffReason).toBe("ninguna");
    expect(d.order.items).toEqual([]);
    expect(d.order.shipping_hnl).toBe(50);
    expect(d.order.total_hnl).toBe(0);
  });
});

describe("planFor (what chekelin does with its decision)", () => {
  const conv = { chekelinReplies: 0, chekelinOrderAt: null } as unknown as LoadedConversation;
  const know: Knowledge = {
    info: { ...EMPTY_CHEKELIN_INFO, payment_methods: "BAC 123" },
    refs: [],
    templates: [],
    pendingOrder: null,
  };
  const decision = (d: Partial<SellerDecision>): SellerDecision => ({
    ...normalizeSeller({} as never),
    messages: ["ok"],
    ...d,
  });
  const order = {
    items: [{ product: "Blusa", details: "", quantity: 2, unit_price_hnl: 300 }],
    customer_name: "Ana",
    city: "Tegus",
    address: "x",
    delivery_method: "envío",
    shipping_hnl: 100,
    total_hnl: 700,
  };

  it("replies normally", () => {
    expect(planFor(decision({}), conv, know)).toEqual({ kind: "reply" });
  });

  it("hands off when the model has nothing to say or after 15 messages without an order", () => {
    expect(planFor(decision({ messages: [] }), conv, know)).toMatchObject({ kind: "handoff", dropMessages: true });
    const tired = { ...conv, chekelinReplies: 15 } as LoadedConversation;
    expect(planFor(decision({}), tired, know)).toMatchObject({ kind: "handoff", reason: HANDOFF_REASON_LABEL.tope });
    expect(planFor(decision({}), { ...tired, chekelinOrderAt: "x" } as LoadedConversation, know)).toEqual({ kind: "reply" });
  });

  it("keeps selling when information is missing: asks the team instead of handing off", () => {
    expect(planFor(decision({ action: "handoff", handoffReason: "falta_info" }), conv, know)).toEqual({
      kind: "ask_team",
      reason: HANDOFF_REASON_LABEL.falta_info,
    });
    // Nothing to say at all: a person takes it.
    expect(planFor(decision({ action: "handoff", handoffReason: "falta_info", messages: [] }), conv, know)).toMatchObject({
      kind: "handoff",
      lineKind: "confirm",
    });
    expect(planFor(decision({ action: "handoff", handoffReason: "ninguna" }), conv, know)).toMatchObject({
      reason: HANDOFF_REASON_LABEL.pide_persona,
    });
  });

  it("opens a Queja", () => {
    expect(planFor(decision({ action: "complaint" }), conv, know)).toEqual({ kind: "complaint" });
  });

  it("takes an order only when the total adds up and payment methods exist", () => {
    expect(planFor(decision({ action: "order_ready", order }), conv, know)).toEqual({ kind: "order", order });
    expect(planFor(decision({ action: "order_ready", order: { ...order, total_hnl: 650 } }), conv, know)).toMatchObject({
      kind: "handoff",
      reason: HANDOFF_REASON_LABEL.total,
    });
    expect(planFor(decision({ action: "order_ready", order: { ...order, items: [], total_hnl: 100 } }), conv, know)).toMatchObject({
      reason: HANDOFF_REASON_LABEL.total,
    });
    const noPayments = { ...know, info: { ...know.info, payment_methods: "  " } };
    expect(planFor(decision({ action: "order_ready", order }), conv, noPayments)).toMatchObject({
      reason: HANDOFF_REASON_LABEL.sin_formas_pago,
    });
  });

  it("matches a receipt to the pending order, or hands off", () => {
    expect(planFor(decision({ action: "payment_receipt" }), conv, know)).toMatchObject({
      reason: HANDOFF_REASON_LABEL.comprobante_sin_cobro,
    });
    const pending = { ...know, pendingOrder: { id: "o1", concept: "Blusa", totalHnl: 700, receiptSent: false } };
    expect(planFor(decision({ action: "payment_receipt" }), conv, pending)).toEqual({ kind: "receipt", orderId: "o1" });
  });
});

describe("stageAfterChekelin (chekeo moves on its own)", () => {
  const reply = (messages: string[], productsSent = 0) => ({ messages, productsSent });

  it("a first answer moves a new deal to Consulta", () => {
    expect(stageAfterChekelin("nuevo", reply(["Hola, ¿qué andás buscando?"]))).toBe("consulta");
    expect(stageAfterChekelin(null, reply(["Hola"]))).toBe("consulta");
  });

  it("sending a price or a product moves it to Cotización", () => {
    expect(stageAfterChekelin("nuevo", reply(["La blusa negra está en L 450"]))).toBe("cotizacion");
    expect(stageAfterChekelin("consulta", reply(["Sale a L450 con envío"]))).toBe("cotizacion");
    expect(stageAfterChekelin("consulta", reply(["Cuesta 450 lempiras"]))).toBe("cotizacion");
    expect(stageAfterChekelin("consulta", reply(["Te mando la foto"], 1))).toBe("cotizacion");
  });

  it("never moves a deal backwards or out of Ganado/Perdido", () => {
    expect(stageAfterChekelin("cotizacion", reply(["ok"]))).toBeNull();
    expect(stageAfterChekelin("cotizacion", reply(["L 450"]))).toBeNull();
    expect(stageAfterChekelin("negociacion", reply(["L 450"], 1))).toBeNull();
    expect(stageAfterChekelin("ganado", reply(["L 450"]))).toBeNull();
    expect(stageAfterChekelin("perdido", reply(["hola"]))).toBeNull();
    expect(stageAfterChekelin("consulta", reply(["¿En qué talla?"]))).toBeNull();
  });

  it("a phone number or a time isn't a price", () => {
    expect(stageAfterChekelin("consulta", reply(["Llamanos al 9988-7766, abrimos a las 9"]))).toBeNull();
  });
});

describe("navigation", () => {
  it("has a chekelin page in the menu, right after chekeo", () => {
    const hrefs = DEFAULT_NAV_ITEMS.map((i) => i.href);
    expect(hrefs).toContain("/chekelin");
    expect(hrefs.indexOf("/chekelin")).toBe(hrefs.indexOf("/chekeo") + 1);
  });
});
