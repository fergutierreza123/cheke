import type { Message } from "@/lib/types";

// "No leídos" in the Chat list: how many of the customer's messages nobody
// on the team has seen yet. A message stops counting when:
//   - someone opens the chat (markConversationRead sets inbound status
//     "read", the same moment the customer sees blue ticks / "Visto"), or
//   - a person answers after it (in cheke or from the phone, Coexistence):
//     they obviously read it. chekelin answering does NOT count: a person
//     still has to look.
// History imported when the number was connected never counts (those chats
// were already handled on the phone).
// The database computes the same rule in the `conversation_unread` view
// (migration 0034); keep both in step.

type UnreadFields = Pick<Message, "direction" | "status" | "is_bot" | "source">;

function countsAsUnread(m: UnreadFields): boolean {
  return m.direction === "in" && m.status !== "read" && m.source !== "history";
}

function personAnswered(m: UnreadFields): boolean {
  return m.direction === "out" && !m.is_bot;
}

// Messages in chronological order (oldest first).
export function countUnread(messages: UnreadFields[]): number {
  let count = 0;
  for (const m of messages) {
    if (personAnswered(m)) count = 0;
    else if (countsAsUnread(m)) count += 1;
  }
  return count;
}

// The list's count after one live (Realtime) message insert or update.
// An inbound message turning "read" means someone opened the chat, and
// opening marks every message of it read at once.
export function unreadAfterMessage(current: number, m: UnreadFields): number {
  if (personAnswered(m)) return 0;
  if (m.direction === "in" && m.status === "read") return 0;
  if (countsAsUnread(m)) return current + 1;
  return current;
}

// "No leídos" on: chats with unread messages, plus the one the person opened
// from the filtered list (it stays while they read it, like WhatsApp). Never
// the chat Chat selected on its own when it loaded: that one kept a read chat
// on the list, so the filter looked like it hadn't applied.
export function inUnreadFilter(c: { id: string; unread_count?: number | null }, openedId: string | null): boolean {
  return (c.unread_count ?? 0) > 0 || c.id === openedId;
}

// The green badge's text; null = no badge.
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
