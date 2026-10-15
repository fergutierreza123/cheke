import type { SupabaseClient } from "@supabase/supabase-js";
import { GRAPH_API_VERSION } from "@/lib/meta";

// Coexistence: right after a business connects the number it already uses in
// the WhatsApp Business app, we ask Meta to send over the phone's contacts
// and then up to 6 months of chat history (they arrive later through the
// webhook). Meta allows each request only once, and only within 24 hours of
// connecting — after that the business has to disconnect and connect again.
// So we only mark a request as done when Meta accepted it, and never repeat
// one that was.

export const COEXISTENCE_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

type SyncChannel = {
  id: string;
  external_id: string;
  connected_at: string | null;
  contacts_sync_requested_at: string | null;
  history_sync_requested_at: string | null;
};

export async function requestCoexistenceSync(
  supabase: SupabaseClient,
  channel: SyncChannel,
  accessToken: string,
): Promise<{ error?: string }> {
  if (channel.connected_at && Date.now() - new Date(channel.connected_at).getTime() > COEXISTENCE_SYNC_WINDOW_MS) {
    return { error: "Pasaron más de 24 horas desde la conexión. Desconecta y vuelve a conectar WhatsApp para importar tus chats." };
  }

  // Contacts first, then history: the order Meta asks for.
  for (const syncType of ["smb_app_state_sync", "history"] as const) {
    const column = syncType === "history" ? "history_sync_requested_at" : "contacts_sync_requested_at";
    if (channel[column]) continue;

    let res: Response;
    try {
      res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${channel.external_id}/smb_app_data`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { error: "No se pudo contactar a Meta para importar tus chats. Intenta de nuevo." };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { error: data?.error?.message ?? "Meta no aceptó la importación de tus chats." };
    }

    await supabase.from("channels").update({ [column]: new Date().toISOString() }).eq("id", channel.id);
  }
  return {};
}
