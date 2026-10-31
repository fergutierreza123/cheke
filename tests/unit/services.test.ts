import { describe, expect, it } from "vitest";
import { hour12, normalizeOpeningHours, openingHoursText, type OpeningHours } from "@/lib/services";

// Sunday first (like Date.getDay()): domingo, lunes … sábado.
const WEEK: OpeningHours = [
  null,
  { open: "09:00", close: "17:00" },
  { open: "09:00", close: "17:00" },
  { open: "09:00", close: "17:00" },
  { open: "09:00", close: "17:00" },
  { open: "09:00", close: "17:00" },
  { open: "08:30", close: "12:00" },
];

describe("normalizeOpeningHours", () => {
  it("keeps a valid week", () => {
    expect(normalizeOpeningHours(WEEK)).toEqual({ hours: WEEK });
  });

  it("treats nothing as 'no horario yet'", () => {
    expect(normalizeOpeningHours(null)).toEqual({ hours: null });
    expect(normalizeOpeningHours(undefined)).toEqual({ hours: null });
  });

  it("refuses a closing time that isn't after the opening time, naming the day", () => {
    const bad = [...WEEK];
    bad[2] = { open: "17:00", close: "09:00" };
    expect(normalizeOpeningHours(bad).error).toMatch(/martes/);
    bad[2] = { open: "09:00", close: "09:00" };
    expect(normalizeOpeningHours(bad).error).toMatch(/martes/);
  });

  it("refuses times that aren't HH:MM and weeks without 7 days", () => {
    const bad = [...WEEK];
    bad[1] = { open: "9", close: "17:00" };
    expect(normalizeOpeningHours(bad).error).toMatch(/lunes/);
    bad[1] = { open: "25:00", close: "26:00" };
    expect(normalizeOpeningHours(bad).error).toMatch(/lunes/);
    expect(normalizeOpeningHours(WEEK.slice(0, 6)).error).toBeDefined();
    expect(normalizeOpeningHours("lunes a viernes").error).toBeDefined();
  });

  it("drops anything extra the browser sent with a day", () => {
    const sent = [...WEEK] as unknown[];
    sent[1] = { open: "09:00", close: "17:00", hack: true };
    expect(normalizeOpeningHours(sent).hours?.[1]).toEqual({ open: "09:00", close: "17:00" });
  });
});

describe("openingHoursText", () => {
  it("reads the week from Monday, as people say it", () => {
    expect(openingHoursText(WEEK)).toBe(
      "lunes 9:00 a. m. a 5:00 p. m.; martes 9:00 a. m. a 5:00 p. m.; miércoles 9:00 a. m. a 5:00 p. m.; jueves 9:00 a. m. a 5:00 p. m.; viernes 9:00 a. m. a 5:00 p. m.; sábado 8:30 a. m. a 12:00 p. m.; domingo cerrado",
    );
  });

  it("is empty when there is no horario", () => {
    expect(openingHoursText(null)).toBe("");
  });
});

describe("hour12", () => {
  it("writes minutes after midnight the Honduran way", () => {
    expect(hour12(0)).toBe("12:00 a. m.");
    expect(hour12(9 * 60 + 5)).toBe("9:05 a. m.");
    expect(hour12(12 * 60)).toBe("12:00 p. m.");
    expect(hour12(15 * 60)).toBe("3:00 p. m.");
  });
});
