import type { Message } from "@/lib/types";

// How Chat lays out a conversation, WhatsApp-style. Pure, so it is tested
// on its own (tests/unit/chatTimeline.test.ts).

// The ticks a bubble shows. A real chat shows exactly what Meta reported
// (one grey ✓ until WhatsApp says delivered / read): blue ticks the
// customer never produced would tell the seller "she saw it" when she
// didn't. Only sample chats and /demo, with nobody on the other side, play
// WhatsApp's animation: ✓, ✓✓ after 1.2 s, blue ✓✓ after 3.2 s.
export function displayStatus(m: Message, { nowMs, sample }: { nowMs: number; sample: boolean }): Message["status"] {
  if (!sample || m.direction !== "out" || m.status !== "sent") return m.status;
  const elapsed = nowMs - new Date(m.created_at).getTime();
  if (elapsed > 3200) return "read";
  if (elapsed > 1200) return "delivered";
  return "sent";
}

// A message that arrived live (Realtime, or the answer of a send) goes
// where its time says. Usually the bottom; an echo from the phone or a
// delayed delivery may belong a little higher. The same id again replaces
// the old copy.
export function insertInOrder(list: Message[], msg: Message): Message[] {
  const existing = list.findIndex((m) => m.id === msg.id);
  if (existing !== -1) return list.map((m, i) => (i === existing ? msg : m));
  const at = new Date(msg.created_at).getTime();
  let index = list.length;
  while (index > 0 && new Date(list[index - 1].created_at).getTime() > at) index--;
  return [...list.slice(0, index), msg, ...list.slice(index)];
}

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a).getTime()) === startOfDay(new Date(b).getTime());
}

// The chip between days, in the viewer's own time: "Hoy", "Ayer", the
// weekday within the last week, then "2 de octubre" (+ year if another one).
export function dayLabel(iso: string, nowMs: number): string {
  const day = startOfDay(new Date(iso).getTime());
  const today = startOfDay(nowMs);
  const days = Math.round((today - day) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  const d = new Date(day);
  if (days < 7) return WEEKDAYS[d.getDay()];
  const date = `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(nowMs).getFullYear() ? date : `${date} de ${d.getFullYear()}`;
}

// The voice note speed button: 1× → 1.5× → 2× → 1×.
export const PLAYBACK_RATES = [1, 1.5, 2] as const;
export function nextPlaybackRate(rate: number): number {
  const i = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
  return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
}
