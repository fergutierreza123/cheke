import type { Message } from "@/lib/types";

// The Chat list's «Sin responder» chip and the "who wrote last" prefix
// (docs/research/respond-io-ui-baseline.md, items 3 and 4).

export type LastMessage = Pick<Message, "direction" | "is_bot" | "source" | "sent_by">;

// «Sin responder»: the customer wrote last and nobody answered. chekelin's
// reply counts as an answer, except in a chat it passed to a person (the
// database keeps `awaiting_since` set then). Imported history never counts.
// Unlike «No leídos», opening the chat doesn't take it off; only a reply.
// The chat the person opened from the filtered list stays while they're in
// it, like «No leídos».
export function inUnrepliedFilter(
  c: { id: string; awaiting_since?: string | null },
  last: LastMessage | null | undefined,
  openedId: string | null,
): boolean {
  if (c.id === openedId || c.awaiting_since) return true;
  return last?.direction === "in" && last.source !== "history";
}

type Person = { userId: string; name: string; role: string };

// "Tú: ", "chekelin: " or the teammate's first name before the last message,
// like WhatsApp. The customer's own messages get none.
export function lastMessagePrefix(last: LastMessage | null | undefined, me: string | null, people: Person[]): string {
  if (!last || last.direction === "in") return "";
  if (last.is_bot) return last.source === "broadcast" ? "Campaña: " : "chekelin: ";
  // A reply from the business phone or a Meta app has no sender in cheke;
  // the database gives those chats to the Dueño, so name the Dueño.
  const author = last.sent_by
    ? people.find((p) => p.userId === last.sent_by)
    : people.find((p) => p.role === "owner");
  if (!author || author.userId === me || people.length < 2) return "Tú: ";
  return `${author.name.split(" ")[0]}: `;
}
