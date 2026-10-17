import type { WhatsAppMessage } from "@/lib/whatsappMessages";

// Pure readers for the "small" events that change a message already in the
// chat instead of adding a new one: a quoted reply, a reaction, an edit or a
// delete. Shared by the WhatsApp and Instagram/Messenger webhooks (issue #51).

export const DELETED_TEXT = "Mensaje eliminado";

// The emojis offered under a message (WhatsApp's own quick set).
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

// Instagram only lets a business react with a heart.
export const INSTAGRAM_REACTION = "❤️";

// WhatsApp: the id of the message a reply quotes (`context.id`). Forwarded
// messages also carry `context`, but quote nothing.
export function whatsappReplyTo(message: WhatsAppMessage): string | null {
  const context = message.context;
  if (!context?.id || context.forwarded || context.frequently_forwarded) return null;
  return context.id;
}

// WhatsApp `type: reaction`: which message, and the emoji ("" = removed).
export function whatsappReaction(message: WhatsAppMessage): { targetId: string; emoji: string | null } | null {
  if (message.type !== "reaction" || !message.reaction?.message_id) return null;
  return { targetId: message.reaction.message_id, emoji: message.reaction.emoji || null };
}

// WhatsApp `type: edit` / `type: revoke` (customer, or Coexistence echoes of
// what the business did on its phone). The edit carries the new message.
export type WhatsAppChange =
  | { kind: "edit"; targetId: string; message: WhatsAppMessage }
  | { kind: "revoke"; targetId: string };

export function whatsappChange(message: WhatsAppMessage): WhatsAppChange | null {
  if (message.type === "edit") {
    const targetId = message.edit?.original_message_id ?? message.context?.id;
    const inner = message.edit?.message;
    if (!targetId || !inner) return null;
    return {
      kind: "edit",
      targetId,
      message: { ...inner, id: targetId, from: message.from, timestamp: message.timestamp, type: inner.type ?? "text" },
    };
  }
  if (message.type === "revoke") {
    const targetId = message.revoke?.original_message_id ?? message.context?.id;
    return targetId ? { kind: "revoke", targetId } : null;
  }
  return null;
}

// Instagram / Messenger: the mid a message replies to. Story replies carry
// `reply_to.story` instead and quote no message.
export function metaReplyTo(message: { reply_to?: { mid?: string } } | undefined): string | null {
  return message?.reply_to?.mid ?? null;
}

// Instagram / Messenger reaction event. Instagram's "love" may come without
// an emoji; unreact clears it.
export function metaReaction(
  reaction: { mid?: string; action?: string; emoji?: string; reaction?: string } | undefined,
): { targetId: string; emoji: string | null } | null {
  if (!reaction?.mid) return null;
  if (reaction.action === "unreact") return { targetId: reaction.mid, emoji: null };
  const emoji = reaction.emoji || META_REACTION_EMOJI[reaction.reaction ?? ""] || "👍";
  return { targetId: reaction.mid, emoji };
}

const META_REACTION_EMOJI: Record<string, string> = {
  love: "❤️",
  smile: "😆",
  wow: "😮",
  sad: "😢",
  angry: "😠",
  like: "👍",
  dislike: "👎",
  other: "👍",
};

// What a stored message turns into once its edit or delete is applied.
export function deletedFields(at: string) {
  return { body: DELETED_TEXT, deleted_at: at, reaction_in: null, reaction_out: null };
}
