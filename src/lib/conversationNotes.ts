import type { ConversationNote } from "@/lib/types";

// Team-only notes on a chat (table conversation_notes): what Chat's one-line
// strip shows above the conversation. Pure, shared by the bot (which writes
// the labels) and Chat (which reads them).

// chekelin asked the team something it didn't know. A handoff note whose
// reason starts with this is "falta info", not a Traspaso.
export const FALTA_INFO_LABEL = "chekelin no tenía la información";

export type NoteTag = "traspaso" | "queja" | "pago" | "falta_info";

export function noteTag(note: Pick<ConversationNote, "kind" | "reason">): NoteTag {
  if (note.kind === "complaint") return "queja";
  if (note.kind === "payment") return "pago";
  if (note.reason?.startsWith(FALTA_INFO_LABEL)) return "falta_info";
  return "traspaso";
}

// The summary as one short line for the strip (chekelin's team_summary can run
// several sentences). Cut at a word, never mid-word; `cut` says whether
// "Ver más" has anything more to show.
export function shortSummary(summary: string, max = 80): { text: string; cut: boolean } {
  const flat = summary.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return { text: flat, cut: false };
  let head = flat.slice(0, max);
  if (flat[max] !== " ") {
    const lastSpace = head.lastIndexOf(" ");
    if (lastSpace > 0) head = head.slice(0, lastSpace);
  }
  return { text: `${head.replace(/[\s,;:.·-]+$/, "")}…`, cut: true };
}

export const NOTE_TAG_LABEL: Record<NoteTag, string> = {
  traspaso: "Traspaso",
  queja: "Queja",
  pago: "Pago",
  falta_info: "Falta info",
};

// What the strip shows: one note in front, the rest behind "+N" (newest
// first). An open Queja stays in front: chekelin is quiet until it's resolved.
export function noteStrip(
  notes: ConversationNote[],
  { complaintOpen }: { complaintOpen: boolean },
): { head: ConversationNote; rest: ConversationNote[] } | null {
  if (notes.length === 0) return null;
  const sorted = [...notes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const head = (complaintOpen && sorted.find((n) => n.kind === "complaint")) || sorted[0];
  return { head, rest: sorted.filter((n) => n !== head) };
}
