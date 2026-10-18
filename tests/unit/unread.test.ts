import { describe, expect, it } from "vitest";
import { countUnread, unreadAfterMessage, unreadBadge } from "@/lib/unread";

type M = Parameters<typeof countUnread>[0][number];
const inbound = (status: M["status"] = "delivered", extra: Partial<M> = {}): M => ({
  direction: "in",
  status,
  is_bot: false,
  source: "cheke",
  ...extra,
});
const outbound = (extra: Partial<M> = {}): M => ({ direction: "out", status: "sent", is_bot: false, source: "cheke", ...extra });

describe("countUnread", () => {
  it("counts the customer's messages nobody on the team has opened", () => {
    expect(countUnread([inbound(), inbound("sent"), inbound()])).toBe(3);
  });

  it("skips messages already marked read when someone opened the chat", () => {
    expect(countUnread([inbound("read"), inbound("read"), inbound()])).toBe(1);
  });

  it("is zero once a person answered after them (e.g. from the phone)", () => {
    expect(countUnread([inbound(), inbound(), outbound({ source: "phone" })])).toBe(0);
    expect(countUnread([inbound(), outbound(), inbound()])).toBe(1);
  });

  it("still counts them when only chekelin answered", () => {
    expect(countUnread([inbound(), outbound({ is_bot: true }), inbound()])).toBe(2);
  });

  it("ignores chat history imported when the number was connected", () => {
    expect(countUnread([inbound("delivered", { source: "history" }), inbound()])).toBe(1);
  });

  it("is zero for an empty chat", () => {
    expect(countUnread([])).toBe(0);
  });
});

describe("unreadAfterMessage", () => {
  it("adds one for a new customer message", () => {
    expect(unreadAfterMessage(2, inbound())).toBe(3);
  });

  it("clears when a person answers or someone marks the chat read", () => {
    expect(unreadAfterMessage(4, outbound())).toBe(0);
    expect(unreadAfterMessage(4, inbound("read"))).toBe(0);
  });

  it("leaves the count alone for chekelin's replies and imported history", () => {
    expect(unreadAfterMessage(2, outbound({ is_bot: true }))).toBe(2);
    expect(unreadAfterMessage(2, inbound("delivered", { source: "history" }))).toBe(2);
  });
});

describe("unreadBadge", () => {
  it("shows nothing at zero, the number, and 99+ past 99", () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(7)).toBe("7");
    expect(unreadBadge(99)).toBe("99");
    expect(unreadBadge(140)).toBe("99+");
  });
});
