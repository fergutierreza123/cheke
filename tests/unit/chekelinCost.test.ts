import { describe, expect, it } from "vitest";
import { chekelinCostReport, usageCostUsd, usageRecords } from "@/lib/chekelinCost";

// What each chekelin model call cost (issue #9): the token usage the API
// returns, priced per model.
describe("usage records from an API response", () => {
  it("reads the four token counts of a normal call", () => {
    expect(
      usageRecords("claude-sonnet-5-5", {
        input_tokens: 600,
        output_tokens: 350,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 0,
        iterations: null,
      }),
    ).toEqual([{ model: "claude-sonnet-5-5", input_tokens: 600, output_tokens: 350, cache_read_tokens: 4000, cache_write_tokens: 0 }]);
  });

  it("counts every attempt when a refusal fell back to another model", () => {
    const records = usageRecords("claude-opus-5-5", {
      input_tokens: 700,
      output_tokens: 300,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 4000,
      iterations: [
        { type: "message", model: "claude-sonnet-5-5", input_tokens: 650, output_tokens: 40, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 },
        { type: "fallback_message", model: "claude-opus-5-5", input_tokens: 700, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 4000 },
      ],
    });
    expect(records.map((r) => [r.model, r.input_tokens, r.output_tokens])).toEqual([
      ["claude-sonnet-5-5", 650, 40],
      ["claude-opus-5-5", 700, 300],
    ]);
  });

  it("treats missing cache counts as zero", () => {
    expect(usageRecords("claude-sonnet-5-5", { input_tokens: 10, output_tokens: 5 })[0]).toMatchObject({
      cache_read_tokens: 0,
      cache_write_tokens: 0,
    });
  });
});

describe("cost of a call", () => {
  // Anthropic's pricing page, 2026-10-20.
  it("prices Sonnet 5.5 at $2 in, $10 out, $2.50 cache write, $0.10 cache read per million", () => {
    const cost = usageCostUsd({
      model: "claude-sonnet-5-5",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_tokens: 1_000_000,
      cache_write_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(14.6, 6);
  });

  it("a typical chekelin reply costs about half a US cent with a warm cache", () => {
    // 600 new input tokens, 350 output, 4,000 cached instructions read.
    const cost = usageCostUsd({ model: "claude-sonnet-5-5", input_tokens: 600, output_tokens: 350, cache_read_tokens: 4000, cache_write_tokens: 0 });
    expect(cost).toBeCloseTo(0.0051, 6);
  });

  it("can't price a model it doesn't know", () => {
    expect(usageCostUsd({ model: "claude-unknown-9", input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0 })).toBeNull();
  });
});

describe("monthly report", () => {
  const call = (business: string, conversation: string | null, output: number, model = "claude-sonnet-5-5") => ({
    business_id: business,
    conversation_id: conversation,
    model,
    input_tokens: 0,
    output_tokens: output,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
  });

  it("adds up cost per conversation and per Negocio", () => {
    const report = chekelinCostReport([
      call("luna", "c1", 1000), // $0.01
      call("luna", "c1", 1000), // $0.01
      call("luna", "c2", 2000), // $0.02
      call("luna", null, 500), // a comment reply: Negocio total only, $0.005
      call("sol", "c3", 4000), // $0.04
    ]);
    expect(report.totalUsd).toBeCloseTo(0.085, 6);
    expect(report.conversations).toEqual([
      { businessId: "sol", conversationId: "c3", calls: 1, costUsd: expect.closeTo(0.04, 6) },
      { businessId: "luna", conversationId: "c1", calls: 2, costUsd: expect.closeTo(0.02, 6) },
      { businessId: "luna", conversationId: "c2", calls: 1, costUsd: expect.closeTo(0.02, 6) },
    ]);
    expect(report.businesses).toEqual([
      { businessId: "luna", conversations: 2, calls: 4, costUsd: expect.closeTo(0.045, 6), perConversationUsd: expect.closeTo(0.02, 6) },
      { businessId: "sol", conversations: 1, calls: 1, costUsd: expect.closeTo(0.04, 6), perConversationUsd: expect.closeTo(0.04, 6) },
    ]);
    expect(report.unpricedModels).toEqual([]);
  });

  it("lists models it couldn't price instead of hiding them", () => {
    const report = chekelinCostReport([call("luna", "c1", 1000), call("luna", "c1", 1000, "claude-new-model")]);
    expect(report.unpricedModels).toEqual(["claude-new-model"]);
    expect(report.totalUsd).toBeCloseTo(0.01, 6);
  });
});
