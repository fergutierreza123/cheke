import type { ChannelType } from "@/lib/types";

// Canales → "Link y QR" (issue #116): the link a Tienda shares (bio, flyer,
// sticker on the counter) so a customer lands straight in its chat.

export const DEFAULT_LINK_MESSAGE = "Hola, quiero más información";

// What Canales knows about a connected Canal (see ChannelItem).
export type LinkableChannel = {
  type: ChannelType;
  display_phone: string | null;
  page_id: string | null;
  // Instagram keeps "@username" here (metaActions.ts).
  verified_name: string | null;
};

// Null when cheke doesn't have the identifier the link needs (e.g. a test
// number with no display_phone): Canales then hides the button.
//
// Only WhatsApp takes the first message: wa.me documents `?text=`. Meta's
// m.me (Messenger) and ig.me/m (Instagram) links only document `?ref=`, which
// reaches the webhook as a referral, not as text in the customer's box, so
// `message` is ignored for them.
export function channelLink(channel: LinkableChannel, message = DEFAULT_LINK_MESSAGE): string | null {
  if (channel.type === "whatsapp") {
    // wa.me wants the full number in digits only: no +, spaces or dashes.
    const digits = (channel.display_phone ?? "").replace(/\D/g, "");
    if (digits.length < 8) return null;
    const text = message.trim();
    return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  }
  if (channel.type === "instagram") {
    const username = (channel.verified_name ?? "").trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) return null;
    return `https://ig.me/m/${username}`;
  }
  const pageId = (channel.page_id ?? "").trim();
  if (!/^\d+$/.test(pageId)) return null;
  return `https://m.me/${pageId}`;
}
