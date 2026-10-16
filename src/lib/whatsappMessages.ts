import type { MediaInfo, MediaKind } from "@/lib/types";

// Shape of an incoming WhatsApp message as Meta sends it (only the parts we
// read) and how each kind is shown in the chat.
type WhatsAppFile = { id?: string; mime_type?: string; caption?: string };
export type WhatsAppMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: WhatsAppFile;
  video?: WhatsAppFile;
  audio?: WhatsAppFile & { voice?: boolean };
  document?: WhatsAppFile & { filename?: string };
  sticker?: WhatsAppFile;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string; wa_id?: string }> }>;
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

// The text saved as the message's body: what the chat list, chekelin and
// notifications show, and what Chat shows when the photo/audio itself
// couldn't be downloaded (src/lib/messageMedia.ts). Returns null for message
// types that shouldn't appear in the conversation at all.
export function describeMessage(message: WhatsAppMessage): string | null {
  switch (message.type) {
    case "text":
      return message.text?.body ?? "";
    case "image":
      return message.image?.caption ? `📷 ${message.image.caption}` : "📷 Foto";
    case "video":
      return message.video?.caption ? `🎥 ${message.video.caption}` : "🎥 Video";
    case "audio":
      return "🎤 Nota de voz";
    case "document":
      return `📄 ${message.document?.filename ?? message.document?.caption ?? "Documento"}`;
    case "sticker":
      return "Sticker";
    case "location": {
      const where = [message.location?.name, message.location?.address].filter(Boolean).join(", ");
      return where ? `📍 ${where}` : "📍 Ubicación";
    }
    case "contacts": {
      const names = contactCards(message).map((c) => c.name).join(", ");
      return names ? `👤 ${names}` : "👤 Contacto compartido";
    }
    case "button":
      return message.button?.text ?? "";
    case "interactive":
      return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? "";
    case "media_placeholder":
      // Imported chat history: photos, audio and files come as placeholders.
      return "📎 Archivo del historial";
    case "reaction":
      return null;
    default:
      return "Mensaje de un tipo que cheke todavía no puede mostrar";
  }
}

// The media a message carries, for Chat to show it: the kind, its details
// and, for files, WhatsApp's media id to download it with. Null for plain
// text (and for history placeholders, which carry no file).
export function whatsappMedia(message: WhatsAppMessage): { kind: MediaKind; info: MediaInfo; mediaId?: string } | null {
  switch (message.type) {
    case "image":
    case "video":
    case "sticker": {
      const file = message[message.type];
      return { kind: message.type, info: caption(file?.caption), mediaId: file?.id };
    }
    case "audio":
      return { kind: message.audio?.voice ? "voice" : "audio", info: {}, mediaId: message.audio?.id };
    case "document":
      return {
        kind: "document",
        info: { ...caption(message.document?.caption), ...(message.document?.filename ? { filename: message.document.filename } : {}) },
        mediaId: message.document?.id,
      };
    case "location": {
      const { latitude, longitude, name, address } = message.location ?? {};
      if (typeof latitude !== "number" || typeof longitude !== "number") return null;
      return { kind: "location", info: { latitude, longitude, ...(name ? { place: name } : {}), ...(address ? { address } : {}) } };
    }
    case "contacts":
      return { kind: "contacts", info: { contacts: contactCards(message) } };
    default:
      return null;
  }
}

function caption(text: string | undefined): MediaInfo {
  return text ? { caption: text } : {};
}

function contactCards(message: WhatsAppMessage) {
  return (message.contacts ?? []).map((c) => ({
    name: c.name?.formatted_name ?? "Contacto",
    phones: (c.phones ?? []).map((p) => p.phone ?? p.wa_id ?? "").filter(Boolean),
  }));
}
