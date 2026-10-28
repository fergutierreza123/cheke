import { describe, expect, it } from "vitest";
import { inUnrepliedFilter, lastMessagePrefix, type LastMessage } from "@/lib/chatList";

const fromCustomer: LastMessage = { direction: "in", is_bot: false, source: "cheke", sent_by: null };
const fromPerson = (sent_by: string | null, source: LastMessage["source"] = "cheke"): LastMessage => ({
  direction: "out",
  is_bot: false,
  source,
  sent_by,
});
const fromChekelin: LastMessage = { direction: "out", is_bot: true, source: "cheke", sent_by: null };

describe("inUnrepliedFilter («Sin responder»)", () => {
  const chat = { id: "c1", awaiting_since: null };

  it("keeps chats where the customer wrote last", () => {
    expect(inUnrepliedFilter(chat, fromCustomer, null)).toBe(true);
  });

  it("drops chats a person or chekelin answered", () => {
    expect(inUnrepliedFilter(chat, fromPerson("u1"), null)).toBe(false);
    expect(inUnrepliedFilter(chat, fromChekelin, null)).toBe(false);
  });

  it("keeps a chat chekelin passed to a person (awaiting_since) even after its handoff message", () => {
    expect(inUnrepliedFilter({ id: "c1", awaiting_since: "2026-10-27T10:00:00Z" }, fromChekelin, null)).toBe(true);
  });

  it("ignores imported history and empty chats", () => {
    expect(inUnrepliedFilter(chat, { ...fromCustomer, source: "history" }, null)).toBe(false);
    expect(inUnrepliedFilter(chat, null, null)).toBe(false);
  });

  it("keeps the chat the person opened from the filtered list", () => {
    expect(inUnrepliedFilter(chat, fromPerson("u1"), "c1")).toBe(true);
  });
});

describe("lastMessagePrefix", () => {
  const team = [
    { userId: "u1", name: "Ana Mejía", role: "owner" },
    { userId: "u2", name: "Luis Funes", role: "agent" },
  ];

  it("gives the customer's messages no prefix", () => {
    expect(lastMessagePrefix(fromCustomer, "u1", team)).toBe("");
    expect(lastMessagePrefix(null, "u1", team)).toBe("");
  });

  it("says Tú for my replies and the teammate's first name for theirs", () => {
    expect(lastMessagePrefix(fromPerson("u1"), "u1", team)).toBe("Tú: ");
    expect(lastMessagePrefix(fromPerson("u2"), "u1", team)).toBe("Luis: ");
  });

  it("names chekelin and Campañas", () => {
    expect(lastMessagePrefix(fromChekelin, "u1", team)).toBe("chekelin: ");
    expect(lastMessagePrefix({ ...fromChekelin, source: "broadcast" }, "u1", team)).toBe("Campaña: ");
  });

  it("gives a reply from the business phone to the Dueño", () => {
    expect(lastMessagePrefix(fromPerson(null, "phone"), "u2", team)).toBe("Ana: ");
    expect(lastMessagePrefix(fromPerson(null, "phone"), "u1", team)).toBe("Tú: ");
  });

  it("says Tú when the Negocio is one person", () => {
    expect(lastMessagePrefix(fromPerson(null, "phone"), "u1", [team[0]])).toBe("Tú: ");
  });
});
