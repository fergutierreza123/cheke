import type { ChannelType } from "@/lib/types";
import { credentialsForChannel, markWhatsAppRead, RECONNECT_MESSAGE, sendWhatsAppMessage, sendWhatsAppTyping } from "@/lib/whatsapp";
import { metaCredentialsForChannel, sendMetaMessage, sendMetaReaction, sendMetaSeen, sendMetaTyping } from "@/lib/metaMessaging";
import { replyWindow, windowClosedMessage } from "@/lib/messagingWindow";
import { isMetaAuthError } from "@/lib/metaTokens";
import { markChannelNeedsReconnect, regeneratePageToken } from "@/lib/channelHealth";

// Server-only. Sends one outgoing message on whatever channel the
// conversation came in on (WhatsApp, Instagram or Facebook Messenger), so
// Chat replies and chekelin don't each need to know every network.
//
// The columns to select for it, on a conversation query:
//   window_expires_at, contact:contacts(phone, fb_psid, ig_id),
//   channel:channels(id, type, external_id, page_id, access_token_encrypted)
export const SEND_CONTACT_COLUMNS = "phone, fb_psid, ig_id";
export const SEND_CHANNEL_COLUMNS = "id, type, external_id, page_id, access_token_encrypted";

export type SendChannel = {
  // Lets a send Meta refuses for auth reasons mark the Canal "Reconectar"
  // (issue #56). Optional so older callers still type-check.
  id?: string;
  type: ChannelType;
  external_id: string | null;
  page_id: string | null;
  access_token_encrypted: string | null;
};
export type SendContact = { phone: string | null; fb_psid: string | null; ig_id: string | null };

export type SendResult = {
  // Meta's id for the sent message (may be missing if Meta didn't return one).
  externalMessageId?: string;
  // Tried and failed, or not allowed right now: show it.
  error?: string;
  // Meta's error code/text when it refused the send, so Chat can explain why.
  errorCode?: number;
  errorDetails?: string;
  // Nothing to send to (demo conversation, no channel, contact without an id
  // on that network): the message only lives in cheke, as before.
  notSent?: true;
};

// chekelin's "escribiendo…" while it waits before replying. WhatsApp needs
// the id of the customer's message (it is also marked as read); Instagram
// and Messenger only the customer. Only while the 24 h window is open.
export async function showTyping(input: {
  channel: SendChannel | null | undefined;
  contact: SendContact | null | undefined;
  windowExpiresAt: string | null;
  inboundMessageId: string | null | undefined;
}): Promise<void> {
  const { channel, contact } = input;
  if (!channel || !contact) return;
  if (replyWindow(channel.type, input.windowExpiresAt, Date.now()) !== "open") return;
  if (channel.type === "whatsapp") {
    if (input.inboundMessageId) await sendWhatsAppTyping(credentialsForChannel(channel), input.inboundMessageId);
    return;
  }
  const recipientId = channel.type === "instagram" ? contact.ig_id : contact.fb_psid;
  if (recipientId) await sendMetaTyping(recipientId, metaCredentialsForChannel(channel));
}

export async function sendOnChannel(input: {
  channel: SendChannel | null | undefined;
  contact: SendContact | null | undefined;
  windowExpiresAt: string | null;
  text: string;
  mediaUrl?: string | null;
  // "human" = typed by a person in Chat; "bot" = chekelin or any automation.
  author: "human" | "bot";
  // Meta's id of the message being answered ("Responder"), if any.
  replyToExternalId?: string | null;
}): Promise<SendResult> {
  const { channel, contact, text, mediaUrl, author, replyToExternalId } = input;
  if (!channel || !contact) return { notSent: true };

  const state = replyWindow(channel.type, input.windowExpiresAt, Date.now());
  if (state === "closed") return { error: windowClosedMessage(channel.type) };
  // Past 24 h only a person may answer on Instagram/Facebook (HUMAN_AGENT).
  if (state === "human_agent" && author === "bot") {
    return { error: "chekelin no responde después de 24 horas." };
  }

  if (channel.type === "whatsapp") {
    if (!contact.phone) return { notSent: true };
    const result = await sendWhatsAppMessage(contact.phone, text, credentialsForChannel(channel), mediaUrl, {
      replyToId: replyToExternalId,
    });
    if (result.needsReconnect && channel.id) {
      await markChannelNeedsReconnect(channel.id, `whatsapp_${result.errorCode ?? "auth"}`);
    }
    return result.error
      ? { error: result.error, errorCode: result.errorCode, errorDetails: result.errorDetails }
      : { externalMessageId: result.externalMessageId };
  }

  const recipientId = channel.type === "instagram" ? contact.ig_id : contact.fb_psid;
  if (!recipientId) return { notSent: true };
  const options = { mediaUrl, humanAgent: state === "human_agent", replyToMid: replyToExternalId };
  let result = await sendMetaMessage(recipientId, text, metaCredentialsForChannel(channel), options);
  if (isMetaAuthError(result.graphError) && channel.id) {
    // The Page token stopped working: get a fresh one with the client's
    // stored token and try once more before asking for "Reconectar".
    const fresh = await regeneratePageToken(channel.id);
    if (fresh) result = await sendMetaMessage(recipientId, text, fresh, options);
    if (isMetaAuthError(result.graphError)) {
      await markChannelNeedsReconnect(channel.id, `meta_${result.graphError?.code ?? "auth"}`);
      return { error: RECONNECT_MESSAGE, errorDetails: result.error };
    }
  }
  return result.error ? { error: result.error } : { externalMessageId: result.externalMessageId };
}

// Which networks let the business react, and with what: WhatsApp any emoji,
// Instagram only a heart, Messenger not at all.
export function reactionsAllowed(type: ChannelType | null | undefined): "any" | "heart" | "none" {
  if (type === "whatsapp") return "any";
  if (type === "instagram") return "heart";
  return "none";
}

// The business reacts to a message (emoji null = takes it back). Only while
// the customer can still be written to (WhatsApp: 24 h window).
export async function reactOnChannel(input: {
  channel: SendChannel | null | undefined;
  contact: SendContact | null | undefined;
  windowExpiresAt: string | null;
  externalMessageId: string | null;
  emoji: string | null;
}): Promise<SendResult> {
  const { channel, contact, externalMessageId, emoji } = input;
  if (!channel || !contact || !externalMessageId) return { notSent: true };
  if (replyWindow(channel.type, input.windowExpiresAt, Date.now()) === "closed") {
    return { error: windowClosedMessage(channel.type) };
  }
  if (channel.type === "whatsapp") {
    if (!contact.phone) return { notSent: true };
    const result = await sendWhatsAppMessage(contact.phone, "", credentialsForChannel(channel), null, {
      reaction: { messageId: externalMessageId, emoji: emoji ?? "" },
    });
    if (result.needsReconnect && channel.id) {
      await markChannelNeedsReconnect(channel.id, `whatsapp_${result.errorCode ?? "auth"}`);
    }
    return result.error ? { error: result.error } : {};
  }
  if (channel.type === "instagram") {
    if (!contact.ig_id) return { notSent: true };
    return sendMetaReaction(contact.ig_id, externalMessageId, emoji, metaCredentialsForChannel(channel));
  }
  return { error: "Facebook Messenger no permite reaccionar desde cheke." };
}

// An agent opened the chat: the customer sees their messages as read
// (WhatsApp blue ticks; "Visto" on Instagram/Messenger). WhatsApp needs the
// newest message's id; it marks every earlier one too. Best effort.
export async function markReadOnChannel(input: {
  channel: SendChannel | null | undefined;
  contact: SendContact | null | undefined;
  latestInboundId: string | null;
}): Promise<void> {
  const { channel, contact } = input;
  if (!channel || !contact) return;
  if (channel.type === "whatsapp") {
    if (input.latestInboundId) await markWhatsAppRead(credentialsForChannel(channel), input.latestInboundId);
    return;
  }
  const recipientId = channel.type === "instagram" ? contact.ig_id : contact.fb_psid;
  if (recipientId) await sendMetaSeen(recipientId, metaCredentialsForChannel(channel));
}
