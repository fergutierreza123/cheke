import { describe, expect, it } from "vitest";
import { formatLempiras, parseLempiras, productMessageText } from "@/lib/format";

// Prices and deal values on every screen (Catálogo, chekeo, Analítica,
// Notificaciones) and in the product messages customers receive.
describe("formatLempiras", () => {
  it("shows whole amounts without decimals, with thousands separated by commas", () => {
    expect(formatLempiras(0)).toBe("L 0");
    expect(formatLempiras(950)).toBe("L 950");
    expect(formatLempiras(1500)).toBe("L 1,500");
    expect(formatLempiras(2_300_000)).toBe("L 2,300,000");
  });

  it("shows cents with exactly two decimals, never one or three", () => {
    expect(formatLempiras(1500.5)).toBe("L 1,500.50");
    expect(formatLempiras(99.9)).toBe("L 99.90");
    expect(formatLempiras(12345.678)).toBe("L 12,345.68");
  });

  it("hides floating-point noise from sums (0.1 + 0.2)", () => {
    expect(formatLempiras(0.1 + 0.2)).toBe("L 0.30");
    expect(formatLempiras(100.004)).toBe("L 100");
  });

  it("reads a numeric value that arrives as text from the database", () => {
    expect(formatLempiras("1500.50" as unknown as number)).toBe("L 1,500.50");
  });

  it("is what the customer sees in a product message", () => {
    expect(productMessageText({ name: "Vestido azul", price_hnl: 1250.5, description: null })).toBe("Vestido azul — L 1,250.50");
  });
});

// What people type in Catálogo's price and chekeo's deal value. Honduras
// writes "1,500.50"; Spanish phone keyboards often only offer a comma for
// decimals ("1500,50").
describe("parseLempiras", () => {
  it("reads plain numbers and amounts with thousands commas", () => {
    expect(parseLempiras("950")).toBe(950);
    expect(parseLempiras("1,500")).toBe(1500);
    expect(parseLempiras("1,500.50")).toBe(1500.5);
    expect(parseLempiras("L 2,300")).toBe(2300);
    expect(parseLempiras(" 12.5 ")).toBe(12.5);
  });

  it("reads a decimal comma from a Spanish phone keyboard as cents, not as thousands", () => {
    expect(parseLempiras("1500,50")).toBe(1500.5);
    expect(parseLempiras("99,9")).toBe(99.9);
  });

  it("rounds to cents", () => {
    expect(parseLempiras("10.999")).toBe(11);
  });

  it("refuses text that isn't an amount instead of turning it into 0", () => {
    expect(parseLempiras("abc")).toBeNull();
    expect(parseLempiras("1.5.0")).toBeNull();
    expect(parseLempiras("-50")).toBeNull();
    expect(parseLempiras("")).toBeNull();
  });
});
