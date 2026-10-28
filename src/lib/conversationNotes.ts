import { firstNameOf } from "@/lib/chekelinState";
import { formatMessageTime } from "@/lib/format";
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

// Who a note mentions: everyone whose "@Name" appears in it as a whole name.
// Longest names first, so "@Juana" isn't Juan and "@Ana López" isn't Ana.
export function mentionedIds(text: string, people: { userId: string; name: string }[]): string[] {
  let rest = text.toLowerCase();
  const found = new Set<string>();
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (!p.name) continue;
    const name = p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const at = new RegExp(`@${name}(?![\\p{L}\\p{N}])`, "gu");
    if (!at.test(rest)) continue;
    found.add(p.userId);
    rest = rest.replace(at, " ");
  }
  return people.filter((p) => found.has(p.userId)).map((p) => p.userId);
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

// A note that @mentions the person looking (not one they wrote). chekelin's
// Traspaso / Queja notes mention who gets the chat (author_id null).
export function mentionsMe(note: ConversationNote, me: { userId: string; name: string } | null): boolean {
  if (!me || note.author_id === me.userId) return false;
  return mentionedIds(note.summary, [me]).length > 0;
}

// chekelin's team_summary, "Qué quiere · Qué falta", as one line of ≤200
// characters with the "…", so it fits a phone notification. The prompt asks
// for it; this is the guarantee.
export const TEAM_SUMMARY_MAX = 200;
export function clampTeamSummary(summary: string): string {
  return shortSummary(summary, TEAM_SUMMARY_MAX - 1).text;
}

// "@Ana López" at the end of chekelin's note, so the person who gets the chat
// sees the "@" badge. No name in their profile: no mention.
export function withMention(summary: string, name: string | null): string {
  return name ? `${summary} · @${name}` : summary;
}

// The strip's bold part: why chekelin passed the chat ("Pide descuento o
// pedido especial"), else who wrote the note; an open Queja says so.
export function stripLabel(note: ConversationNote, authorNames: Record<string, string>): string {
  const tag = noteTag(note);
  if (tag === "queja") return "Queja";
  if (tag === "traspaso" && note.reason) return note.reason;
  return noteAuthor(note, authorNames);
}

export function noteAuthor(note: ConversationNote, authorNames: Record<string, string>): string {
  if (note.kind !== "team") return "chekelin";
  return (note.author_id && authorNames[note.author_id]) || "Equipo";
}

// The grey line in the thread at the moment of a Traspaso or a Queja
// ("chekelin le pasó el chat a Ana · 3:42 p.m."). Other notes: none.
export function noteMarker(note: ConversationNote, people: { userId: string; name: string }[]): string | null {
  const tag = noteTag(note);
  const at = formatMessageTime(note.created_at);
  if (tag === "queja") return `Se abrió una queja · ${at}`;
  if (tag !== "traspaso") return null;
  const to = people.find((p) => mentionedIds(note.summary, [p]).length > 0);
  return `chekelin le pasó el chat a ${(to && firstNameOf(to.name)) || "una persona"} · ${at}`;
}
