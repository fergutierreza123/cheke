"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentBusiness } from "@/lib/business";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/whatsapp";

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Finishes Meta's "Embedded Signup" for the signed-in business: the popup
// (see ConnectWhatsAppButton) hands us a one-time `code` plus the WhatsApp
// Business Account and phone number the person chose. We trade the code for
// a token, point Meta's webhooks at this app, register the number, and save
// the connection with the token encrypted. Owners only.
export async function connectWhatsAppChannel(input: {
  code: string;
  phoneNumberId: string;
  wabaId: string;
}): Promise<{ error?: string; warning?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role !== "owner") return { error: "Solo el dueño del negocio puede conectar canales." };

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) return { error: "Falta configurar la app de Meta en el servidor." };
  if (!input.code || !input.phoneNumberId || !input.wabaId) return { error: "Meta no devolvió todos los datos." };

  // Fail early, before touching Meta, if encryption isn't set up.
  try {
    encryptSecret("probe");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cifrar la conexión." };
  }

  // A number can only belong to one business (the webhook routes incoming
  // messages by phone_number_id). Admin client: RLS would hide other
  // businesses' channels from this check.
  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("channels")
    .select("business_id")
    .eq("type", "whatsapp")
    .eq("external_id", input.phoneNumberId)
    .neq("business_id", business.id)
    .limit(1);
  if (claimed && claimed.length > 0) return { error: "Este número ya está conectado a otro negocio en cheke." };

  const tokenRes = await fetch(
    `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(input.code)}`,
  );
  const tokenData = await tokenRes.json();
  const accessToken: string | undefined = tokenData?.access_token;
  if (!accessToken) return { error: tokenData?.error?.message ?? "Meta no aceptó la autorización. Intenta de nuevo." };
  const encryptedToken = encryptSecret(accessToken);

  const auth = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  // Without this, Meta never sends this business's messages to our webhook.
  const subscribeRes = await fetch(`${GRAPH}/${input.wabaId}/subscribed_apps`, { method: "POST", headers: auth });
  if (!subscribeRes.ok) {
    const data = await subscribeRes.json().catch(() => null);
    return { error: data?.error?.message ?? "No se pudo activar la recepción de mensajes." };
  }

  // Register the number for the Cloud API. Non-fatal: numbers brought over
  // with WhatsApp Business app "coexistence" (or already registered) reject
  // this, and they still work.
  let warning: string | undefined;
  let encryptedPin: string | null = null;
  const pin = String(randomInt(100000, 1000000));
  const registerRes = await fetch(`${GRAPH}/${input.phoneNumberId}/register`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  if (registerRes.ok) {
    encryptedPin = encryptSecret(pin);
  } else {
    const data = await registerRes.json().catch(() => null);
    warning = `El número se conectó, pero Meta no pudo registrarlo: ${data?.error?.message ?? "error desconocido"}`;
  }

  const detailsRes = await fetch(`${GRAPH}/${input.phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const details = detailsRes.ok ? await detailsRes.json() : {};

  const fields = {
    external_id: input.phoneNumberId,
    waba_id: input.wabaId,
    access_token_encrypted: encryptedToken,
    registration_pin_encrypted: encryptedPin,
    display_phone: details?.display_phone_number ?? null,
    verified_name: details?.verified_name ?? null,
    status: "connected",
    connected_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("channels")
    .select("id")
    .eq("business_id", business.id)
    .eq("type", "whatsapp")
    .limit(1)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("channels").update(fields).eq("id", existing.id)
    : await supabase.from("channels").insert({ business_id: business.id, type: "whatsapp", ...fields });
  if (error) return { error: error.message };

  revalidatePath("/channels");
  return { warning };
}

export async function disconnectChannel(channelId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role !== "owner") return { error: "Solo el dueño del negocio puede desconectar canales." };

  const supabase = await createClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("id, waba_id, access_token_encrypted")
    .eq("id", channelId)
    .eq("business_id", business.id)
    .single();
  if (!channel) return { error: "No se encontró el canal." };

  // Best effort: stop Meta sending this number's messages here.
  if (channel.waba_id && channel.access_token_encrypted) {
    try {
      await fetch(`${GRAPH}/${channel.waba_id}/subscribed_apps`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${decryptSecret(channel.access_token_encrypted)}` },
      });
    } catch (e) {
      console.error("channels: could not unsubscribe webhook", e);
    }
  }

  const { error } = await supabase
    .from("channels")
    .update({ status: "disconnected", access_token_encrypted: null, registration_pin_encrypted: null })
    .eq("id", channelId)
    .eq("business_id", business.id);
  if (error) return { error: error.message };

  revalidatePath("/channels");
  return {};
}
