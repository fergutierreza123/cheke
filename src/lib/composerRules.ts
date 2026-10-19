import type { ChannelType } from "@/lib/types";
import type { ReplyWindow } from "@/lib/messagingWindow";
import { windowClosedMessage } from "@/lib/messagingWindow";

// What the Chat composer lets a person do right now, per network, reply
// window and Modo prueba. Pure (no React, no server) so the rules are
// tested on their own; ChatView only reads the result.
//
// - The mic is never hidden: when nothing but a Plantilla can go out it
//   stays grey and `mediaBlockedReason` is what it says when tapped.
// - Instagram / Messenger between 24 h and 7 days (HUMAN_AGENT): a person
//   sends voice notes, photos and documents exactly like text (Meta's tag
//   has no content restriction; mediaSend.ts sends attachments with it).
// - Modo prueba: the person types, records and attaches *as the customer*.
//   Nothing reaches a real customer, so it works even in a closed chat.
export type ComposerRules = {
  canSendText: boolean;
  // Mic, photos/videos, camera and documents.
  canSendMedia: boolean;
  // Why the mic / attachments can't send right now (null = they can).
  mediaBlockedReason: string | null;
  // WhatsApp after 24 h: "Plantilla" means "Enviar plantilla" (approved only).
  approvedTemplateOnly: boolean;
  // Modo prueba: what is sent becomes the customer's message.
  asCustomer: boolean;
  // The business's own tools: Cobrar, Ubicación, Respuestas rápidas,
  // reactions and "Responder".
  businessTools: boolean;
};

export const WHATSAPP_PHONE_APP_HINT =
  "Desde la app WhatsApp Business de tu teléfono sí puedes seguir escribiéndole y mandarle notas de voz.";

export function composerRules(input: {
  channelType: ChannelType | null | undefined;
  // Coexistencia: the number also works in the WhatsApp Business app.
  coexistence?: boolean | null;
  replyState: ReplyWindow;
  simulateMode: boolean;
}): ComposerRules {
  if (input.simulateMode) {
    return {
      canSendText: true,
      canSendMedia: true,
      mediaBlockedReason: null,
      approvedTemplateOnly: false,
      asCustomer: true,
      businessTools: false,
    };
  }
  if (input.replyState !== "closed") {
    return {
      canSendText: true,
      canSendMedia: true,
      mediaBlockedReason: null,
      approvedTemplateOnly: false,
      asCustomer: false,
      businessTools: true,
    };
  }
  const whatsapp = !input.channelType || input.channelType === "whatsapp";
  const reason = whatsapp
    ? `Pasaron más de 24 horas desde el último mensaje de este cliente. WhatsApp solo deja enviarle una plantilla aprobada: toca «Enviar plantilla». Cuando te vuelva a escribir, podrás mandarle notas de voz y fotos otra vez.${
        input.coexistence ? ` ${WHATSAPP_PHONE_APP_HINT}` : ""
      }`
    : windowClosedMessage(input.channelType);
  return {
    canSendText: false,
    canSendMedia: false,
    mediaBlockedReason: reason,
    approvedTemplateOnly: whatsapp,
    asCustomer: false,
    businessTools: false,
  };
}
