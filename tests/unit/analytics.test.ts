import { describe, expect, it } from "vitest";
import { channelShares, formatWait, periodStart, salesSummary } from "@/lib/analytics";

describe("formatWait: Tiempo de primera respuesta", () => {
  it("uses seconds, minutes or hours", () => {
    expect(formatWait(40)).toBe("40 s");
    expect(formatWait(150)).toBe("3 min");
    expect(formatWait(3599)).toBe("1 h");
    expect(formatWait(3900)).toBe("1 h 5 min");
  });
});

// Analítica's numbers. Dates are built in local time (the browser's, which
// is what the screen uses), so the tests pass in any time zone.
const WED_OCT_14 = new Date(2026, 9, 14, 15, 30).getTime();

describe("periodStart: the ranges mean what their labels say", () => {
  it("«Esta semana» starts on Monday at midnight", () => {
    expect(new Date(periodStart("semana", WED_OCT_14))).toEqual(new Date(2026, 9, 12, 0, 0));
  });

  it("on a Sunday, «Esta semana» still starts on the Monday before", () => {
    const sunday = new Date(2026, 9, 18, 9, 0).getTime();
    expect(new Date(periodStart("semana", sunday))).toEqual(new Date(2026, 9, 12, 0, 0));
  });

  it("«Este mes» starts on the 1st, not 30 days ago", () => {
    expect(new Date(periodStart("mes", WED_OCT_14))).toEqual(new Date(2026, 9, 1, 0, 0));
  });

  it("«Este trimestre» starts on the quarter's first day", () => {
    expect(new Date(periodStart("trimestre", WED_OCT_14))).toEqual(new Date(2026, 9, 1, 0, 0));
    expect(new Date(periodStart("trimestre", new Date(2026, 7, 20).getTime()))).toEqual(new Date(2026, 6, 1, 0, 0));
  });
});

type Row = { stage: string; value_hnl: number | string | null };
const deal = (stage: string, value_hnl: number | string | null = null): Row => ({ stage, value_hnl });

describe("salesSummary", () => {
  it("adds the value of won deals only, and the conversion of closed ones", () => {
    const s = salesSummary([deal("ganado", 1500), deal("ganado", 250.5), deal("perdido", 900), deal("consulta", 4000)]);
    expect(s).toEqual({ won: 2, lost: 1, revenue: 1750.5, conversionRate: 67 });
  });

  it("adds values that arrive as text instead of gluing them together", () => {
    expect(salesSummary([deal("ganado", "1500.00"), deal("ganado", "250.50")]).revenue).toBe(1750.5);
  });

  it("a won deal without a value counts as a sale of L 0", () => {
    expect(salesSummary([deal("ganado"), deal("ganado", 100)])).toMatchObject({ won: 2, revenue: 100 });
  });

  it("nothing closed yet: 0 %, not NaN", () => {
    expect(salesSummary([deal("nuevo")]).conversionRate).toBe(0);
    expect(salesSummary([]).conversionRate).toBe(0);
  });
});

describe("channelShares: «De dónde llegan tus clientes»", () => {
  const conv = (type: string | null) => ({ channel: type ? { type } : null });

  it("splits by channel and adds up to 100 %", () => {
    const shares = channelShares([conv("whatsapp"), conv("whatsapp"), conv("instagram")]);
    expect(shares).toEqual({ whatsapp: 67, instagram: 33, facebook: 0 });
  });

  it("leaves out contacts added by hand (no channel) instead of shrinking every share", () => {
    expect(channelShares([conv("whatsapp"), conv(null), conv(null), conv(null)])).toEqual({ whatsapp: 100, instagram: 0, facebook: 0 });
  });

  it("no conversations: every channel at 0 %", () => {
    expect(channelShares([])).toEqual({ whatsapp: 0, instagram: 0, facebook: 0 });
  });
});
