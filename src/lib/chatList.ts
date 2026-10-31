import type { Message } from "@/lib/types";

// The Chat list's "who wrote last" prefix
// (docs/research/respond-io-ui-baseline.md, item 4).

export type LastMessage = Pick<Message, "direction" | "is_bot" | "source" | "sent_by">;

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
