import type { Message } from "@/lib/types";

// "Copiar" in a Chat bubble's menu: the words a person would want to paste
// somewhere else (an address, an account number, what the customer said).
// Null = nothing worth copying, so the menu hides "Copiar".
export function copyableText(m: Message): string | null {
  if (m.deleted_at) return null;
  const info = m.media_info ?? {};
  let text: string | null | undefined;
  switch (m.media_kind) {
    case "image":
    case "video":
    case "document":
    case "sticker":
      text = info.caption;
      break;
    case "voice":
    case "audio":
      text = m.transcription;
      break;
    case "location": {
      // The Tienda's own location (Ubicación / chekelin): its text has the
      // Google Maps link the customer got; place + address alone would lose it.
      if (m.direction === "out" && m.body?.startsWith("📍")) {
        text = m.body.replace(/^📍\s*/, "");
        break;
      }
      const where = [info.place, info.address].filter(Boolean).join(", ");
      text = where || (typeof info.latitude === "number" ? `${info.latitude}, ${info.longitude}` : null);
      break;
    }
    case "contacts":
      text = (info.contacts ?? [])
        .map((c) => (c.phones.length ? `${c.name}: ${c.phones.join(", ")}` : c.name))
        .join("\n");
      break;
    default:
      text = m.body;
  }
  return text?.trim() ? text.trim() : null;
}
