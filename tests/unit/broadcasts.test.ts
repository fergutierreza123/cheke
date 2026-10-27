import { describe, expect, it } from "vitest";
import {
  afterFailure,
  batchSize,
  broadcastRecipients,
  estimateCost,
  isOptOutReply,
  parseMessagingLimit,
  recipientValues,
  RETRY_AFTER_MS,
} from "@/lib/broadcasts";
import { HNL_PER_USD } from "@/lib/chekelinCost";

const c = (id: string, phone: string | null, tags: string[], marketing_opt_out = false) => ({ id, name: id, phone, tags, marketing_opt_out });

describe("broadcastRecipients", () => {
  const contacts = [
    c("ana", "9922-3843", ["vip"]),
    c("ana-dup", "+504 9922 3843", ["vip"]), // same phone as ana
    c("beto", null, ["vip"]),
    c("caro", "50488887777", ["vip"], true),
    c("dan", "+1 305 555 0100", ["vip"]),
    c("eva", "33334444", ["mayorista"]),
  ];

  it("keeps tagged contacts with a phone, not opted out, once per phone", () => {
    const r = broadcastRecipients(contacts, ["vip"], "MARKETING");
    expect(r.recipients.map((x) => x.id)).toEqual(["ana"]);
    expect(r).toMatchObject({ noPhone: 1, optedOut: 1, usNumbers: 1 });
  });

  it("only skips +1 numbers for Marketing", () => {
    expect(broadcastRecipients(contacts, ["vip"], "UTILITY").recipients.map((x) => x.id)).toEqual(["ana", "dan"]);
  });

  it("matches any picked Etiqueta, and nobody without one", () => {
    expect(broadcastRecipients(contacts, ["vip", "mayorista"], "UTILITY").recipients).toHaveLength(3);
    expect(broadcastRecipients(contacts, [], "UTILITY").recipients).toHaveLength(0);
  });
});

describe("estimateCost", () => {
  it("uses Meta's Rest of Latin America rates", () => {
    expect(estimateCost(250, "MARKETING").usd).toBeCloseTo(18.5);
    expect(estimateCost(250, "UTILITY").usd).toBeCloseTo(2.825);
    expect(estimateCost(100, "marketing").hnl).toBeCloseTo(7.4 * HNL_PER_USD);
  });
});

describe("daily limit and batches", () => {
  it("reads Meta's tier", () => {
    expect(parseMessagingLimit("TIER_250")).toBe(250);
    expect(parseMessagingLimit("TIER_2K")).toBe(2000);
    expect(parseMessagingLimit("TIER_100K")).toBe(100_000);
    expect(parseMessagingLimit("TIER_UNLIMITED")).toBe(Number.POSITIVE_INFINITY);
    expect(parseMessagingLimit(undefined)).toBeNull();
    expect(parseMessagingLimit("nope")).toBeNull();
  });

  it("never goes past what's left today", () => {
    expect(batchSize(250, 0, 60)).toBe(60);
    expect(batchSize(250, 230, 60)).toBe(20);
    expect(batchSize(250, 250, 60)).toBe(0);
    expect(batchSize(250, 300, 60)).toBe(0);
    expect(batchSize(Number.POSITIVE_INFINITY, 5000, 60)).toBe(60);
  });
});

describe("afterFailure", () => {
  const now = Date.UTC(2026, 9, 26);
  it("131049: one retry, 24 h later", () => {
    expect(afterFailure(131049, 1, now)).toEqual({
      status: "pending",
      nextAttemptAt: new Date(now + RETRY_AFTER_MS).toISOString(),
      optOut: false,
    });
    expect(afterFailure(131049, 2, now)).toEqual({ status: "failed", optOut: false });
  });
  it("131050 opts the customer out; anything else just fails", () => {
    expect(afterFailure(131050, 1, now)).toEqual({ status: "failed", optOut: true });
    expect(afterFailure(131026, 1, now)).toEqual({ status: "failed", optOut: false });
  });
});

describe("isOptOutReply", () => {
  it.each(["BAJA", "baja.", " Baja! ", "No más", "no mas", "STOP", "darme de baja"])("%s opts out", (t) => {
    expect(isOptOutReply(t)).toBe(true);
  });
  it.each(["hola", "¿hay baja de precio?", "no más de 2 por favor", "", null])("%s does not", (t) => {
    expect(isOptOutReply(t)).toBe(false);
  });
});

describe("recipientValues", () => {
  it("puts each customer's first name, or the fallback", () => {
    expect(recipientValues({ "1": "amigo", "2": "20%" }, "1", "ana maría")).toEqual({ "1": "Ana", "2": "20%" });
    expect(recipientValues({ "1": "amigo" }, "1", "50499223843")).toEqual({ "1": "amigo" });
    expect(recipientValues({ "1": "x" }, null, "Ana")).toEqual({ "1": "x" });
  });
});
