import { describe, expect, it, vi } from "vitest";
import { buildPaymentMessage, formatAmount, normalizePaymentLink, orderConcept, parseAmount } from "@/lib/payments";
import { recordPaymentRequest } from "@/lib/orders";

describe("parseAmount", () => {
  it.each([
    ["1250", 1250],
    ["1,250.50", 1250.5],
    ["L 1250", 1250],
    ["Lps. 300", 300],
    ["1 250", 1250],
    ["0.5", 0.5],
  ])("%s → %s", (raw, value) => {
    expect(parseAmount(raw)).toBe(value);
  });

  it.each(["", "0", "-5", "abc", "12.345", "1e5", "10000001"])("refuses %j", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

describe("normalizePaymentLink", () => {
  it("is optional", () => {
    expect(normalizePaymentLink("   ")).toEqual({});
  });

  it("adds https:// when missing", () => {
    expect(normalizePaymentLink("pagos.banco.hn/abc")).toEqual({ link: "https://pagos.banco.hn/abc" });
  });

  it("keeps https links", () => {
    expect(normalizePaymentLink(" https://paypal.me/tienda ")).toEqual({ link: "https://paypal.me/tienda" });
  });

  it.each(["http://banco.hn", "javascript:alert(1)", "ftp://x.hn", "data:text/html,hi"])("refuses %s", (raw) => {
    expect(normalizePaymentLink(raw).error).toBeDefined();
    expect(normalizePaymentLink(raw).link).toBeUndefined();
  });

  it("refuses hosts without a dot and garbage", () => {
    expect(normalizePaymentLink("localhost").error).toBe("El link de pago no es válido.");
    expect(normalizePaymentLink("https://exa mple.com").error).toBe("El link de pago no es válido.");
  });
});

describe("payment message", () => {
  it("formats Lempiras with two decimals", () => {
    expect(formatAmount(1250)).toBe("L 1,250.00");
    expect(formatAmount(0.5)).toBe("L 0.50");
  });

  it("builds the order concept", () => {
    expect(
      orderConcept([
        { name: "Sandalias", quantity: 1, price_hnl: 500, details: "negro, 38" },
        { name: "Blusa", quantity: 2, price_hnl: 300 },
      ]),
    ).toBe("Sandalias (negro, 38), Blusa x2");
    expect(orderConcept([{ name: "Blusa", quantity: 1, price_hnl: 300 }], 100)).toBe("Blusa + envío");
  });

  it("includes link and instructions only when given", () => {
    const withBoth = buildPaymentMessage({ concept: " Blusa ", amountHnl: 300, link: "https://p.hn/x", instructions: " BAC 123 " });
    expect(withBoth).toContain("Concepto: Blusa\n");
    expect(withBoth).toContain("Total: *L 300.00*");
    expect(withBoth).toContain("Paga aquí:\nhttps://p.hn/x");
    expect(withBoth).toContain("\nBAC 123\n");
    const bare = buildPaymentMessage({ concept: "Blusa", amountHnl: 300 });
    expect(bare).not.toContain("Paga aquí");
    expect(bare.endsWith("¡Gracias!")).toBe(true);
  });
});

// A tiny fake of the Supabase query builder: records each call and resolves
// with whatever the test set for that table.
function fakeSupabase(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["insert", "update", "select", "eq", "single", "maybeSingle"]) {
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(results[table] ?? { data: null, error: null });
    return chain;
  };
  return { client: { from } as never, calls };
}

describe("recordPaymentRequest", () => {
  const input = {
    conversationId: "c1",
    businessId: "b1",
    contactId: "k1",
    stage: "consulta",
    items: [{ name: "Blusa", quantity: 1, price_hnl: 300 }],
    totalHnl: 300,
    source: "cheke" as const,
  };

  it("records the order and moves an early deal to negociación", async () => {
    const { client, calls } = fakeSupabase({
      orders: { data: { id: "o1", total_hnl: "300.00", payment_link: null, created_at: "t" } },
    });
    const order = await recordPaymentRequest(client, input);
    expect(order).toEqual({ id: "o1", total_hnl: 300, payment_link: null, created_at: "t" });
    const insert = calls.find((c) => c.table === "orders" && c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ status: "awaiting_payment", business_id: "b1", source: "cheke", details: {} });
    const update = calls.find((c) => c.table === "conversations" && c.op === "update")!.args[0];
    expect(update).toEqual({ value_hnl: 300, stage: "negociacion" });
  });

  it("never moves a won deal backwards", async () => {
    const { client, calls } = fakeSupabase({ orders: { data: { id: "o1", total_hnl: 300, payment_link: null, created_at: "t" } } });
    await recordPaymentRequest(client, { ...input, stage: "ganado" });
    expect(calls.find((c) => c.table === "conversations" && c.op === "update")!.args[0]).toEqual({ value_hnl: 300 });
  });

  it("returns null and leaves the deal alone when the insert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, calls } = fakeSupabase({ orders: { data: null, error: { message: "rls" } } });
    expect(await recordPaymentRequest(client, input)).toBeNull();
    expect(calls.some((c) => c.table === "conversations")).toBe(false);
  });
});
