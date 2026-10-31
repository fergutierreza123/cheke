import { describe, expect, it } from "vitest";
import { lastMessagePrefix, type LastMessage } from "@/lib/chatList";

const fromCustomer: LastMessage = { direction: "in", is_bot: false, source: "cheke", sent_by: null };
const fromPerson = (sent_by: string | null, source: LastMessage["source"] = "cheke"): LastMessage => ({
  direction: "out",
  is_bot: false,
  source,
  sent_by,
});
const fromChekelin: LastMessage = { direction: "out", is_bot: true, source: "cheke", sent_by: null };

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
