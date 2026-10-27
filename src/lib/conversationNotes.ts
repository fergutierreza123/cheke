import type { ConversationNote } from "@/lib/types";

// Team-only notes on a chat (table conversation_notes): what Chat's one-line
// strip shows above the conversation. Pure, shared by the bot (which writes
// the labels) and Chat (which reads them).

// chekelin asked the team something it didn't know. A handoff note whose
// reason starts with this is "falta info", not a Traspaso.
export const FALTA_INFO_LABEL = "chekelin no tenía la información";

export type NoteTag = "traspaso" | "queja" | "pago" | "falta_info" | "nota";

export function noteTag(note: Pick<ConversationNote, "kind" | "reason">): NoteTag {
  if (note.kind === "team") return "nota";
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
  nota: "Nota",
};

// "@" in a team note: the name typed so far after the last "@" (at the start
// or after a space), or null when the person isn't mentioning anyone.
// Names have spaces ("Ana López"), so the query may too, up to 30 chars.
export function mentionQuery(draft: string): string | null {
  const match = /(?:^|\s)@([^@\n]{0,30})$/.exec(draft);
  return match ? match[1] : null;
}

// Replace the "@query" being typed with "@Name ".
export function insertMention(draft: string, name: string): string {
  return draft.replace(/@[^@\n]{0,30}$/, `@${name} `);
}

// Who a note mentions: everyone whose "@Name" appears in it.
export function mentionedIds(text: string, people: { userId: string; name: string }[]): string[] {
  const lower = text.toLowerCase();
  return people.filter((p) => p.name && lower.includes(`@${p.name.toLowerCase()}`)).map((p) => p.userId);
}

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

// A team note that @mentions the person looking (not one they wrote).
export function mentionsMe(note: ConversationNote, me: { userId: string; name: string } | null): boolean {
  if (!me || note.kind !== "team" || note.author_id === me.userId) return false;
  return mentionedIds(note.summary, [me]).length > 0;
}

// chekelin's team_summary as one short line (≤120 characters with the "…"),
// so it fits Chat's strip and a phone notification. The prompt asks for one
// short sentence; this is the guarantee.
export const TEAM_SUMMARY_MAX = 120;
export function clampTeamSummary(summary: string): string {
  return shortSummary(summary, TEAM_SUMMARY_MAX - 1).text;
}
