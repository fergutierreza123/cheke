// Shape of an incoming WhatsApp message as Meta sends it (only the parts we
// read) and how each kind is shown in the chat.
export type WhatsAppMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

// What to show in the chat for each kind of incoming message. Media itself
// (the actual photo/audio file) isn't downloaded yet — that needs Meta's
// media API plus storage — so for now the agent sees what was sent and, for
// photos/videos/documents, the caption. Returns null for message types that
// shouldn't appear in the conversation at all.
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
    case "location":
      return "📍 Ubicación";
    case "contacts":
      return "👤 Contacto compartido";
    case "button":
      return message.button?.text ?? "";
    case "interactive":
      return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? "";
    case "reaction":
      return null;
    default:
      return "Mensaje de un tipo que cheke todavía no puede mostrar";
  }
}
