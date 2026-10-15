import type { ChannelType } from "@/lib/types";
import { credentialsForChannel, sendWhatsAppMessage } from "@/lib/whatsapp";
import { metaCredentialsForChannel, sendMetaMessage } from "@/lib/metaMessaging";
import { replyWindow, windowClosedMessage } from "@/lib/messagingWindow";

// Server-only. Sends one outgoing message on whatever channel the
// conversation came in on (WhatsApp, Instagram or Facebook Messenger), so
// Chat replies and chekelin don't each need to know every network.
//
// The columns to select for it, on a conversation query:
//   window_expires_at, contact:contacts(phone, fb_psid, ig_id),
//   channel:channels(type, external_id, page_id, access_token_encrypted)
export const SEND_CONTACT_COLUMNS = "phone, fb_psid, ig_id";
export const SEND_CHANNEL_COLUMNS = "type, external_id, page_id, access_token_encrypted";

export type SendChannel = {
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

export async function sendOnChannel(input: {
  channel: SendChannel | null | undefined;
  contact: SendContact | null | undefined;
  windowExpiresAt: string | null;
  text: string;
  mediaUrl?: string | null;
  // "human" = typed by a person in Chat; "bot" = chekelin or any automation.
  author: "human" | "bot";
}): Promise<SendResult> {
  const { channel, contact, text, mediaUrl, author } = input;
  if (!channel || !contact) return { notSent: true };

  const state = replyWindow(channel.type, input.windowExpiresAt, Date.now());
  if (state === "closed") return { error: windowClosedMessage(channel.type) };
  // Past 24 h only a person may answer on Instagram/Facebook (HUMAN_AGENT).
  if (state === "human_agent" && author === "bot") {
    return { error: "chekelin no responde después de 24 horas." };
  }

  if (channel.type === "whatsapp") {
    if (!contact.phone) return { notSent: true };
    const result = await sendWhatsAppMessage(contact.phone, text, credentialsForChannel(channel), mediaUrl);
    return result.error
      ? { error: result.error, errorCode: result.errorCode, errorDetails: result.errorDetails }
      : { externalMessageId: result.externalMessageId };
  }

  const recipientId = channel.type === "instagram" ? contact.ig_id : contact.fb_psid;
  if (!recipientId) return { notSent: true };
  const result = await sendMetaMessage(recipientId, text, metaCredentialsForChannel(channel), {
    mediaUrl,
    humanAgent: state === "human_agent",
  });
  return result.error ? { error: result.error } : { externalMessageId: result.externalMessageId };
}
