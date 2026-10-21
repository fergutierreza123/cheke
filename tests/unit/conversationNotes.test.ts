import { describe, expect, it } from "vitest";
import { noteStrip, noteTag, shortSummary } from "@/lib/conversationNotes";
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
