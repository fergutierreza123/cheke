import { describe, expect, it } from "vitest";
import {
  CHEKELIN_MONTHLY_CONVERSATIONS,
  chekelinAllowance,
  chekelinMeter,
  chekelinMonth,
  nextChekelinMonthLabel,
} from "@/lib/plan";

// chekelin's monthly allowance (issue #9, founder decision 2026-10-20): each
// Plan includes a number of "conversaciones atendidas por chekelin" per
// calendar month in Honduras, plus any extra pack the founder recorded.
describe("chekelin month (Honduras time)", () => {
  it("is the calendar month in Honduras, not UTC", () => {
    // 31 Oct, 11:30 p. m. in Honduras = 1 Nov 05:30 UTC: still October.
    expect(chekelinMonth(Date.parse("2026-11-01T05:30:00Z"))).toBe("2026-10-01");
    // 1 Nov, 12:00 a. m. in Honduras = 1 Nov 06:00 UTC: November starts.
    expect(chekelinMonth(Date.parse("2026-11-01T06:00:00Z"))).toBe("2026-11-01");
    expect(chekelinMonth(Date.parse("2026-12-31T23:00:00Z"))).toBe("2026-12-01");
  });

  it("names the day it starts again", () => {
    expect(nextChekelinMonthLabel(Date.parse("2026-10-20T15:00:00Z"))).toBe("1 de noviembre");
    expect(nextChekelinMonthLabel(Date.parse("2026-12-20T15:00:00Z"))).toBe("1 de enero");
  });
});

describe("chekelin allowance per Plan", () => {
  const month = "2026-10-01";

  it("comes from the Plan's number", () => {
    expect(chekelinAllowance({ plan: "cheke", openStoreCount: 1, month })).toBe(CHEKELIN_MONTHLY_CONVERSATIONS.cheke.included);
    expect(chekelinAllowance({ plan: "plus", openStoreCount: 1, month })).toBe(CHEKELIN_MONTHLY_CONVERSATIONS.plus.included);
  });

  it("cheke Pro adds conversations for each Tienda beyond the first", () => {
    const pro = CHEKELIN_MONTHLY_CONVERSATIONS.pro;
    expect(chekelinAllowance({ plan: "pro", openStoreCount: 1, month })).toBe(pro.included);
    expect(chekelinAllowance({ plan: "pro", openStoreCount: 3, month })).toBe(pro.included + 2 * pro.perExtraStore);
  });

  it("adds an extra pack only in the month it was bought for", () => {
    const base = chekelinAllowance({ plan: "plus", openStoreCount: 1, month })!;
    expect(chekelinAllowance({ plan: "plus", openStoreCount: 1, month, extra: 200, extraMonth: "2026-10-01" })).toBe(base + 200);
    expect(chekelinAllowance({ plan: "plus", openStoreCount: 1, month, extra: 200, extraMonth: "2026-09-01" })).toBe(base);
    expect(chekelinAllowance({ plan: "plus", openStoreCount: 1, month, extra: 200, extraMonth: null })).toBe(base);
  });

  it("doesn't limit Negocios on a plan that isn't priced yet (pilots, trials)", () => {
    for (const plan of ["trial", "free", "basic", ""]) {
      expect(chekelinAllowance({ plan, openStoreCount: 1, month })).toBeNull();
    }
  });
});

describe("chekelin meter", () => {
  it("reads «132 de 300 conversaciones este mes»", () => {
    expect(chekelinMeter(132, 300)).toEqual({
      used: 132,
      allowance: 300,
      level: "ok",
      text: "chekelin: 132 de 300 conversaciones este mes",
      percent: 44,
    });
  });

  it("warns calmly from 80%", () => {
    expect(chekelinMeter(239, 300).level).toBe("ok");
    expect(chekelinMeter(240, 300).level).toBe("warning");
    expect(chekelinMeter(299, 300).level).toBe("warning");
  });

  it("is over the limit once every conversation is used", () => {
    const meter = chekelinMeter(300, 300);
    expect(meter.level).toBe("over");
    expect(meter.percent).toBe(100);
    expect(chekelinMeter(305, 300).percent).toBe(100);
  });

  it("is a plain count with no limit", () => {
    expect(chekelinMeter(12, null)).toEqual({
      used: 12,
      allowance: null,
      level: "ok",
      text: "chekelin: 12 conversaciones este mes",
      percent: null,
    });
    expect(chekelinMeter(1, null).text).toBe("chekelin: 1 conversación este mes");
  });
});
