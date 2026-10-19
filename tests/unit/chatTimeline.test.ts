import { describe, expect, it } from "vitest";
import { dayLabel, displayStatus, insertInOrder, nextPlaybackRate, sameDay } from "@/lib/chatTimeline";
import type { Message } from "@/lib/types";

// How Chat lays out a conversation: which ticks a bubble shows, where a
// message that arrives late goes, the "Hoy / Ayer" chips between days and
// the voice-note speed button.
const msg = (over: Partial<Message>): Message => ({
  id: "m",
  conversation_id: "c",
  business_id: "b",
  direction: "out",
  body: "hola",
  media_url: null,
  status: "sent",
  is_bot: false,
  created_at: "2026-10-19T15:00:00.000Z",
  ...over,
});

describe("ticks", () => {
  const sentAt = Date.parse("2026-10-19T15:00:00.000Z");

  it("a real chat shows exactly what Meta reported: one grey tick until WhatsApp says delivered or read", () => {
    const m = msg({ status: "sent" });
    expect(displayStatus(m, { nowMs: sentAt + 60_000, sample: false })).toBe("sent");
    expect(displayStatus(msg({ status: "delivered" }), { nowMs: sentAt + 60_000, sample: false })).toBe("delivered");
    expect(displayStatus(msg({ status: "read" }), { nowMs: sentAt + 60_000, sample: false })).toBe("read");
  });

  it("sample chats and /demo (nobody on the other side) play WhatsApp's ✓ → ✓✓ → blue ✓✓", () => {
    const m = msg({ status: "sent" });
    expect(displayStatus(m, { nowMs: sentAt + 500, sample: true })).toBe("sent");
    expect(displayStatus(m, { nowMs: sentAt + 2_000, sample: true })).toBe("delivered");
    expect(displayStatus(m, { nowMs: sentAt + 5_000, sample: true })).toBe("read");
  });

  it("a failed message stays failed, and the customer's messages have no ticks to fake", () => {
    expect(displayStatus(msg({ status: "failed" }), { nowMs: sentAt + 9_000, sample: true })).toBe("failed");
    expect(displayStatus(msg({ direction: "in", status: "sent" }), { nowMs: sentAt + 9_000, sample: true })).toBe("sent");
  });
});

describe("order", () => {
  it("a message that arrives late (an echo, a delayed delivery) goes where its time says, not at the bottom", () => {
    const list = [
      msg({ id: "a", created_at: "2026-10-19T15:00:00.000Z" }),
      msg({ id: "c", created_at: "2026-10-19T15:02:00.000Z" }),
    ];
    const late = msg({ id: "b", created_at: "2026-10-19T15:01:00.000Z" });
    expect(insertInOrder(list, late).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("the newest goes last, and the same message twice (Realtime + the send's answer) is kept once, newest copy", () => {
    const list = [msg({ id: "a", created_at: "2026-10-19T15:00:00.000Z" })];
    const next = msg({ id: "b", created_at: "2026-10-19T15:03:00.000Z" });
    expect(insertInOrder(list, next).map((m) => m.id)).toEqual(["a", "b"]);
    const updated = insertInOrder(list, msg({ id: "a", created_at: "2026-10-19T15:00:00.000Z", status: "read" }));
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe("read");
  });
});

describe("day chips", () => {
  // Local times, so the test reads the same in any time zone.
  const now = new Date(2026, 9, 19, 10, 0).getTime(); // Monday 19 Oct 2026, 10:00

  it("Hoy, Ayer, the weekday this week, then the date (with the year only when it isn't this year)", () => {
    expect(dayLabel(new Date(2026, 9, 19, 8, 0).toISOString(), now)).toBe("Hoy");
    expect(dayLabel(new Date(2026, 9, 18, 23, 30).toISOString(), now)).toBe("Ayer");
    expect(dayLabel(new Date(2026, 9, 15, 12, 0).toISOString(), now)).toBe("Jueves");
    expect(dayLabel(new Date(2026, 9, 2, 12, 0).toISOString(), now)).toBe("2 de octubre");
    expect(dayLabel(new Date(2025, 11, 24, 12, 0).toISOString(), now)).toBe("24 de diciembre de 2025");
  });

  it("two messages on the same calendar day share a chip; across midnight they don't", () => {
    expect(sameDay(new Date(2026, 9, 18, 0, 5).toISOString(), new Date(2026, 9, 18, 23, 55).toISOString())).toBe(true);
    expect(sameDay(new Date(2026, 9, 18, 23, 55).toISOString(), new Date(2026, 9, 19, 0, 5).toISOString())).toBe(false);
  });
});

describe("voice note speed", () => {
  it("cycles 1× → 1.5× → 2× → 1× like WhatsApp", () => {
    expect(nextPlaybackRate(1)).toBe(1.5);
    expect(nextPlaybackRate(1.5)).toBe(2);
    expect(nextPlaybackRate(2)).toBe(1);
  });
});
