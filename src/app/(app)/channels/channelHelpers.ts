import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";
import { graphWithFallback, systemUserToken } from "@/lib/whatsapp";

// Server-only helpers shared by the connect/disconnect actions and by
// archiving a Tienda. Not server actions: nothing here is callable from the
// browser.

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// A number / Page / Instagram account belongs to one Tienda at a time (the
// webhook routes its messages by that id). Connecting it in a Tienda when
// another Tienda of the same Negocio still has it:
// - still connected there → refuse, so its chats don't silently move;
// - disconnected there (or that Tienda is archived) → release it there. The
//   old Tienda keeps its past conversations; new ones start in this Tienda.
// Admin client, only within the caller's own Negocio (already checked): a
// Gerente can't see the other Tiendas' channels.
export async function claimExternalId(
  businessId: string,
  storeId: string,
  type: "whatsapp" | "facebook" | "instagram",
  externalId: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: elsewhere } = await supabase
    .from("channels")
    .select("id, status, stores(archived_at)")
    .eq("business_id", businessId)
    .eq("type", type)
    .eq("external_id", externalId)
    .neq("store_id", storeId);
  for (const row of elsewhere ?? []) {
    const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    if (row.status === "connected" && !store?.archived_at) {
      return type === "whatsapp"
        ? "Este número ya está conectado en otra tienda. Desconéctalo allí primero."
        : "Esta página o su Instagram ya está conectada en otra tienda. Desconéctala allí primero.";
    }
    const { error } = await supabase
      .from("channels")
      .update({ external_id: null, status: "disconnected", access_token_encrypted: null, credential_token_encrypted: null })
      .eq("id", row.id)
      .eq("business_id", businessId);
    if (error) return error.message;
  }
  return null;
}

// Best effort: stop Meta sending this number's messages here. Uses cheke's
// system-user token first when set (the channel's own token may have
// expired), then the channel's own.
export async function unsubscribeWhatsApp(channel: { waba_id: string | null; access_token_encrypted: string | null }) {
  if (!channel.waba_id || !channel.access_token_encrypted) return;
  try {
    let own: string | undefined;
    try {
      own = decryptSecret(channel.access_token_encrypted);
    } catch {
      // unreadable: try the system user's token alone
    }
    const system = systemUserToken();
    const first = system ?? own;
    if (!first) return;
    await graphWithFallback(
      { accessToken: first, fallbackAccessToken: system ? own : undefined, usesSystemToken: Boolean(system) },
      (token) =>
        fetch(`${GRAPH}/${channel.waba_id}/subscribed_apps`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        }),
    );
  } catch (e) {
    console.error("channels: could not unsubscribe webhook", e);
  }
}

// Best effort: stop Meta sending this Page's messages here.
export async function unsubscribeMetaPage(pageId: string, encryptedToken: string | null) {
  if (!encryptedToken) return;
  try {
    await fetch(`${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${decryptSecret(encryptedToken)}` },
    });
  } catch (e) {
    console.error("channels: could not unsubscribe page webhook", e);
  }
}
