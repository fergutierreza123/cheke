import { describe, expect, it } from "vitest";
import {
  clampTeamSummary,
  insertMention,
  mentionedIds,
  mentionQuery,
  mentionsMe,
  noteMarker,
  noteStrip,
  noteTag,
  shortSummary,
  stripLabel,
  TEAM_SUMMARY_MAX,
  withMention,
} from "@/lib/conversationNotes";
import { formatMessageTime } from "@/lib/format";
import type { ConversationNote } from "@/lib/types";

const note = (extra: Partial<ConversationNote> = {}): ConversationNote => ({
  id: "n1",
  conversation_id: "c1",
  store_id: "s1",
  kind: "handoff",
  summary: "Quiere la blusa roja en talla M.",
  reason: "Pidió hablar con una persona",
  created_at: "2026-10-20T15:00:00.000Z",
  ...extra,
});

describe("noteTag", () => {
  it("names a Traspaso, a Queja and a Pago by the note's kind", () => {
    expect(noteTag(note())).toBe("traspaso");
    expect(noteTag(note({ kind: "complaint" }))).toBe("queja");
    expect(noteTag(note({ kind: "payment" }))).toBe("pago");
  });

  it("calls it 'falta info' when chekelin asked the team something it didn't know", () => {
    expect(noteTag(note({ reason: "chekelin no tenía la información · sigue atendiendo" }))).toBe("falta_info");
    // Notes saved before the labels got shorter.
    expect(noteTag(note({ reason: "chekelin no tenía la información: le dijo que lo confirma y sigue atendiendo" }))).toBe(
      "falta_info",
    );
  });
});

describe("shortSummary", () => {
  it("keeps a short summary as it is", () => {
    expect(shortSummary("Quiere la blusa roja en talla M.")).toEqual({ text: "Quiere la blusa roja en talla M.", cut: false });
  });

  it("cuts a long one at a word, around 80 characters, with an ellipsis", () => {
    const long =
      "Juan quiere la guitarra acústica en negro, pregunta si se la pueden apartar hasta el viernes y si el envío a Choluteca se paga contra entrega.";
    expect(shortSummary(long)).toEqual({
      text: "Juan quiere la guitarra acústica en negro, pregunta si se la pueden apartar…",
      cut: true,
    });
  });

  it("joins the lines of a multi-line summary and drops trailing punctuation before the ellipsis", () => {
    expect(shortSummary("Quiere dos blusas,\n  una roja,   otra azul", 26)).toEqual({ text: "Quiere dos blusas, una…", cut: true });
  });
});

describe("noteStrip", () => {
  const older = note({ id: "old", created_at: "2026-10-20T14:00:00.000Z" });
  const queja = note({ id: "queja", kind: "complaint", created_at: "2026-10-20T15:00:00.000Z" });
  const latest = note({ id: "new", kind: "payment", created_at: "2026-10-20T16:00:00.000Z" });

  it("shows nothing when the chat has no notes", () => {
    expect(noteStrip([], { complaintOpen: false })).toBeNull();
  });

  it("leads with the newest note and keeps the rest, newest first, behind +N", () => {
    const strip = noteStrip([older, latest, queja], { complaintOpen: false });
    expect(strip?.head.id).toBe("new");
    expect(strip?.rest.map((n) => n.id)).toEqual(["queja", "old"]);
  });

  it("keeps an open Queja in front, since chekelin stays quiet until it's resolved", () => {
    const strip = noteStrip([latest, queja, older], { complaintOpen: true });
    expect(strip?.head.id).toBe("queja");
    expect(strip?.rest.map((n) => n.id)).toEqual(["new", "old"]);
  });
});

describe("team notes and @mentions", () => {
  const people = [
    { userId: "u1", name: "Ana López" },
    { userId: "u2", name: "Beto" },
  ];

  it("a person's note is a Nota", () => {
    expect(noteTag(note({ kind: "team", reason: null }))).toBe("nota");
  });

  it("reads the name being typed after @", () => {
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("ya le cobré @an")).toBe("an");
    expect(mentionQuery("correo@x")).toBeNull();
    expect(mentionQuery("sin mención")).toBeNull();
  });

  it("puts the picked name in place of what was typed", () => {
    expect(insertMention("ya le cobré @an", "Ana López")).toBe("ya le cobré @Ana López ");
  });

  it("finds who was mentioned, ignoring case", () => {
    expect(mentionedIds("@ana lópez y @Beto: pasa el sábado", people)).toEqual(["u1", "u2"]);
    expect(mentionedIds("Beto ya cobró", people)).toEqual([]);
  });

  it("badges a note that mentions me (a teammate's or chekelin's), not one I wrote", () => {
    const me = { userId: "u1", name: "Ana López" };
    expect(mentionsMe(note({ kind: "team", author_id: "u2", summary: "@Ana López cobrale" }), me)).toBe(true);
    expect(mentionsMe(note({ kind: "team", author_id: "u1", summary: "@Ana López ojo" }), me)).toBe(false);
    expect(mentionsMe(note({ kind: "team", author_id: "u2", summary: "@Beto cobrale" }), me)).toBe(false);
    expect(mentionsMe(note({ summary: withMention("Quiere 2 blusas · Falta la dirección", "Ana López") }), me)).toBe(true);
    expect(mentionsMe(note({ summary: "Quiere 2 blusas" }), me)).toBe(false);
    expect(mentionsMe(note({ kind: "team", author_id: "u2", summary: "@Ana López" }), null)).toBe(false);
  });
});

describe("clampTeamSummary", () => {
  it("keeps chekelin's summary to one line of at most 200 characters", () => {
    const long = "Quiere 2 blusas talla M y pagará por transferencia. ".repeat(5);
    const out = clampTeamSummary(long);
    expect(out.length).toBeLessThanOrEqual(TEAM_SUMMARY_MAX);
    expect(out.endsWith("…")).toBe(true);
    expect(clampTeamSummary("Quiere 2 blusas talla M.")).toBe("Quiere 2 blusas talla M.");
  });
});

describe("Traspaso in the strip and the thread", () => {
  const people = [{ userId: "u1", name: "Ana López" }];

  it("leads the strip with why chekelin passed the chat", () => {
    expect(stripLabel(note({ reason: "Pide descuento o pedido especial" }), {})).toBe("Pide descuento o pedido especial");
    expect(stripLabel(note({ reason: null }), {})).toBe("chekelin");
    expect(stripLabel(note({ kind: "complaint" }), {})).toBe("Queja");
    expect(stripLabel(note({ kind: "team", author_id: "u1" }), { u1: "Ana López" })).toBe("Ana López");
  });

  it("mentions the person only when they have a name", () => {
    expect(withMention("Quiere 2 blusas", "Ana López")).toBe("Quiere 2 blusas · @Ana López");
    expect(withMention("Quiere 2 blusas", null)).toBe("Quiere 2 blusas");
  });

  it("marks a Traspaso and a Queja in the thread, nothing else", () => {
    const at = formatMessageTime(note().created_at);
    expect(noteMarker(note({ summary: withMention("Quiere 2 blusas", "Ana López") }), people)).toBe(
      `chekelin le pasó el chat a Ana · ${at}`,
    );
    expect(noteMarker(note(), people)).toBe(`chekelin le pasó el chat a una persona · ${at}`);
    expect(noteMarker(note({ kind: "complaint" }), people)).toBe(`Se abrió una queja · ${at}`);
    expect(noteMarker(note({ reason: "chekelin no tenía la información · sigue atendiendo" }), people)).toBeNull();
    expect(noteMarker(note({ kind: "payment" }), people)).toBeNull();
    expect(noteMarker(note({ kind: "team", author_id: "u1" }), people)).toBeNull();
  });
});
