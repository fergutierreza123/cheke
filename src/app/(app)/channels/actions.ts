"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentBusiness } from "@/lib/business";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";
import { requestCoexistenceSync } from "@/lib/coexistence";

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Finishes Meta's "Embedded Signup" (v4) for the signed-in business: the
// popup (see ConnectWhatsAppButton) hands us a one-time `code` plus the
// WhatsApp Business Account the person chose, and usually the phone number.
// `coexistence` is true when they connected the number they already use in
// the WhatsApp Business app (they keep using the app on their phone). We
// trade the code for a token, confirm the number belongs to that account,
// point Meta's webhooks at this app, register the number (new numbers only),
// save the connection with the token encrypted, and — for coexistence —
// start importing the phone's contacts and chat history. Owners only.
export async function connectWhatsAppChannel(input: {
  code: string;
  wabaId: string;
  phoneNumberId: string | null;
  coexistence: boolean;
}): Promise<{ error?: string; warning?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role !== "owner") return { error: "Solo el dueño del negocio puede conectar canales." };

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) return { error: "Falta configurar la app de Meta en el servidor." };
  if (!input.code || !input.wabaId) return { error: "Meta no devolvió todos los datos." };

  // Fail early, before touching Meta, if encryption isn't set up.
  try {
    encryptSecret("probe");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cifrar la conexión." };
  }

  // The code expires 30 seconds after the popup closes, so trade it first.
  const tokenRes = await fetch(
    `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(input.code)}`,
  );
  const tokenData = await tokenRes.json().catch(() => null);
  const accessToken: string | undefined = tokenData?.access_token;
  if (!accessToken) return { error: tokenData?.error?.message ?? "Meta no aceptó la autorización. Intenta de nuevo." };
  const encryptedToken = encryptSecret(accessToken);

  const auth = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  // Which number to connect, checked against the account's own list: the
  // browser could send any phone_number_id, and connecting a number this
  // account doesn't own would route someone else's messages here. Meta may
  // leave the number out of the popup's message (e.g. coexistence); then the
  // account's only number is the one.
  const numbersRes = await fetch(
    `${GRAPH}/${encodeURIComponent(input.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`,
    { headers: auth },
  );
  const numbersData = numbersRes.ok ? await numbersRes.json().catch(() => null) : null;
  const numbers: Array<{ id: string; display_phone_number?: string; verified_name?: string }> = numbersData?.data ?? [];
  const number = input.phoneNumberId
    ? numbers.find((n) => n.id === input.phoneNumberId)
    : numbers.length === 1
      ? numbers[0]
      : undefined;
  if (!number) {
    return {
      error: input.phoneNumberId
        ? "Ese número no pertenece a la cuenta de WhatsApp que elegiste."
        : "No pudimos saber qué número conectar. Intenta de nuevo y elige un número.",
    };
  }

  // A number can only belong to one business (the webhook routes incoming
  // messages by phone_number_id). Admin client: RLS would hide other
  // businesses' channels from this check.
  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("channels")
    .select("business_id")
    .eq("type", "whatsapp")
    .eq("external_id", number.id)
    .neq("business_id", business.id)
    .limit(1);
  if (claimed && claimed.length > 0) return { error: "Este número ya está conectado a otro negocio en cheke." };

  // Without this, Meta never sends this business's messages to our webhook.
  const subscribeRes = await fetch(`${GRAPH}/${input.wabaId}/subscribed_apps`, { method: "POST", headers: auth });
  if (!subscribeRes.ok) {
    const data = await subscribeRes.json().catch(() => null);
    return { error: data?.error?.message ?? "No se pudo activar la recepción de mensajes." };
  }

  // Register a new number for the Cloud API. A coexistence number is already
  // registered by the WhatsApp Business app and must not be registered again.
  // Non-fatal: a number that was already registered rejects this and still works.
  let warning: string | undefined;
  let encryptedPin: string | null = null;
  if (!input.coexistence) {
    const pin = String(randomInt(100000, 1000000));
    const registerRes = await fetch(`${GRAPH}/${number.id}/register`, {
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
  }

  const fields = {
    external_id: number.id,
    waba_id: input.wabaId,
    access_token_encrypted: encryptedToken,
    registration_pin_encrypted: encryptedPin,
    display_phone: number.display_phone_number ?? null,
    verified_name: number.verified_name ?? null,
    status: "connected",
    connected_at: new Date().toISOString(),
    coexistence: input.coexistence,
    // A reconnect starts a fresh import window, so forget the old one.
    contacts_sync_requested_at: null,
    history_sync_requested_at: null,
    history_sync_progress: null,
    history_sync_error: null,
  };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("channels")
    .select("id")
    .eq("business_id", business.id)
    .eq("type", "whatsapp")
    .limit(1)
    .maybeSingle();

  const { data: saved, error } = existing
    ? await supabase.from("channels").update(fields).eq("id", existing.id).select("id").single()
    : await supabase.from("channels").insert({ business_id: business.id, type: "whatsapp", ...fields }).select("id").single();
  if (error || !saved) return { error: error?.message ?? "No se pudo guardar la conexión." };

  // Only after the channel is saved: the imported chats arrive through the
  // webhook, which needs the channel to know which business they belong to.
  if (input.coexistence) {
    const sync = await requestCoexistenceSync(
      supabase,
      { id: saved.id, external_id: number.id, connected_at: fields.connected_at, contacts_sync_requested_at: null, history_sync_requested_at: null },
      accessToken,
    );
    if (sync.error) warning = `WhatsApp quedó conectado, pero no se pudieron importar tus chats: ${sync.error} Usa "Importar chats" en Canales.`;
  }

  revalidatePath("/channels");
  return { warning };
}

// "Importar chats" in Canales: retries the coexistence contacts/history
// import if Meta didn't accept it at connect time. Owners only.
export async function retryCoexistenceSync(channelId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role !== "owner") return { error: "Solo el dueño del negocio puede importar chats." };

  const supabase = await createClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("id, external_id, access_token_encrypted, coexistence, connected_at, contacts_sync_requested_at, history_sync_requested_at")
    .eq("id", channelId)
    .eq("business_id", business.id)
    .single();
  if (!channel?.coexistence || !channel.external_id || !channel.access_token_encrypted) {
    return { error: "Este canal no puede importar chats." };
  }

  let accessToken: string;
  try {
    accessToken = decryptSecret(channel.access_token_encrypted);
  } catch {
    return { error: "No se pudo leer la conexión. Desconecta y vuelve a conectar WhatsApp." };
  }

  const result = await requestCoexistenceSync(supabase, { ...channel, external_id: channel.external_id }, accessToken);
  revalidatePath("/channels");
  return result;
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
