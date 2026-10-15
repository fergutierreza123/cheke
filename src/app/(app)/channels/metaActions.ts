"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentBusiness } from "@/lib/business";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";
import { PAGE_SUBSCRIBED_FIELDS } from "@/lib/metaMessaging";

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// "Conectar Instagram y Facebook" in Canales, in two steps:
//
// 1. startMetaConnection: the Facebook Login for Business popup (see
//    ConnectMetaButton) hands us a one-time `code`. We trade it for the
//    owner's token and list the Facebook Pages they manage, each with its
//    linked Instagram professional account. The token never goes to the
//    browser: it travels back encrypted (only this server can read it) so
//    the owner can pick a Page.
// 2. connectMetaPage: with the chosen Page id, we list the owner's Pages
//    again *with that token* and only accept a Page that's on the list — a
//    browser could send any id. Then we subscribe the Page to our webhook and
//    save one channel for the Page (Messenger) and one for its Instagram.
//
// Owners only.

export type MetaPageOption = { id: string; name: string; instagram: { id: string; username: string | null } | null };

type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
};

const SESSION_TTL_MS = 15 * 60 * 1000;

async function ownerBusiness() {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." } as const;
  if (business.role !== "owner") return { error: "Solo el dueño del negocio puede conectar canales." } as const;
  return { business } as const;
}

async function listPages(token: string, withTokens: boolean): Promise<{ pages?: MetaPage[]; error?: string }> {
  const fields = `id,name,${withTokens ? "access_token," : ""}instagram_business_account{id,username}`;
  try {
    const res = await fetch(`${GRAPH}/me/accounts?fields=${encodeURIComponent(fields)}&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: data?.error?.message ?? "Meta no devolvió tus páginas de Facebook." };
    return { pages: data?.data ?? [] };
  } catch {
    return { error: "No se pudo contactar a Meta. Revisa tu conexión e intenta de nuevo." };
  }
}

export async function startMetaConnection(
  code: string,
): Promise<{ error?: string; session?: string; pages?: MetaPageOption[] }> {
  const owner = await ownerBusiness();
  if ("error" in owner) return { error: owner.error };

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) return { error: "Falta configurar la app de Meta en el servidor." };
  if (!code) return { error: "Meta no devolvió la autorización." };

  try {
    encryptSecret("probe");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cifrar la conexión." };
  }

  // The code expires quickly, so trade it first.
  const tokenRes = await fetch(
    `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`,
  ).catch(() => null);
  const tokenData = await tokenRes?.json().catch(() => null);
  let token: string | undefined = tokenData?.access_token;
  if (!token) return { error: tokenData?.error?.message ?? "Meta no aceptó la autorización. Intenta de nuevo." };

  // A long-lived user token gives Page tokens that never expire. A business
  // (system user) token is already long-lived and Meta just rejects this.
  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(token)}`,
  ).catch(() => null);
  const longData = longRes?.ok ? await longRes.json().catch(() => null) : null;
  if (longData?.access_token) token = longData.access_token as string;

  const { pages, error } = await listPages(token, false);
  if (error || !pages) return { error };
  if (pages.length === 0) {
    return {
      error:
        "No encontramos ninguna página de Facebook en tu cuenta. Vuelve a intentarlo y, en la ventana de Meta, elige tu página (y tu cuenta de Instagram conectada a ella).",
    };
  }

  const session = encryptSecret(
    JSON.stringify({ token, businessId: owner.business.id, expiresAt: Date.now() + SESSION_TTL_MS }),
  );
  return {
    session,
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name ?? "Página sin nombre",
      instagram: p.instagram_business_account
        ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? null }
        : null,
    })),
  };
}

export async function connectMetaPage(
  session: string,
  pageId: string,
): Promise<{ error?: string; warning?: string }> {
  const owner = await ownerBusiness();
  if ("error" in owner) return { error: owner.error };
  const { business } = owner;

  let token: string;
  try {
    const parsed = JSON.parse(decryptSecret(session)) as { token: string; businessId: string; expiresAt: number };
    if (parsed.businessId !== business.id || parsed.expiresAt < Date.now()) throw new Error("expired");
    token = parsed.token;
  } catch {
    return { error: "La autorización de Meta venció. Vuelve a tocar \"Conectar Instagram y Facebook\"." };
  }

  // Never trust the id from the browser: it must be one of this person's Pages.
  const { pages, error: listError } = await listPages(token, true);
  if (listError || !pages) return { error: listError };
  const page = pages.find((p) => p.id === pageId);
  if (!page) return { error: "Esa página no pertenece a tu cuenta de Facebook." };
  if (!page.access_token) {
    return { error: "Meta no dio permiso para responder mensajes de esa página. Revisa que seas administrador de la página." };
  }
  const pageToken = page.access_token;
  const instagram = page.instagram_business_account ?? null;

  // A Page / Instagram account can only belong to one business (the webhook
  // routes messages by its id). Admin client: RLS would hide other
  // businesses' channels from this check.
  const admin = createAdminClient();
  const ids = [page.id, instagram?.id].filter((id): id is string => Boolean(id));
  const { data: claimed } = await admin
    .from("channels")
    .select("business_id")
    .in("type", ["facebook", "instagram"])
    .in("external_id", ids)
    .neq("business_id", business.id)
    .limit(1);
  if (claimed && claimed.length > 0) return { error: "Esta página o su Instagram ya está conectada a otro negocio en cheke." };

  // Without this, Meta never sends this Page's (or its Instagram's) messages
  // to our webhook. If `feed` (for Comentarios, later) isn't allowed yet,
  // still subscribe the messaging fields.
  const subscribe = async (fields: string[]) => {
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(page.id)}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields.join(","))}`,
      { method: "POST", headers: { Authorization: `Bearer ${pageToken}` } },
    ).catch(() => null);
    const data = await res?.json().catch(() => null);
    return res?.ok ? null : (data?.error?.message ?? "No se pudo activar la recepción de mensajes.");
  };
  let subscribeError = await subscribe(PAGE_SUBSCRIBED_FIELDS);
  if (subscribeError) subscribeError = await subscribe(PAGE_SUBSCRIBED_FIELDS.filter((f) => f !== "feed"));
  if (subscribeError) return { error: subscribeError };

  let warning: string | undefined;
  const supabase = await createClient();
  const common = {
    page_id: page.id,
    access_token_encrypted: encryptSecret(pageToken),
    status: "connected",
    connected_at: new Date().toISOString(),
  };

  const facebookError = await saveChannel(supabase, business.id, "facebook", page.id, {
    ...common,
    verified_name: page.name ?? null,
  });
  if (facebookError) return { error: facebookError };

  if (instagram) {
    const instagramError = await saveChannel(supabase, business.id, "instagram", instagram.id, {
      ...common,
      verified_name: instagram.username ? `@${instagram.username}` : null,
    });
    if (instagramError) warning = `Facebook quedó conectado, pero Instagram no: ${instagramError}`;
  } else {
    // The Page no longer has an Instagram linked: stop using the old one.
    await supabase
      .from("channels")
      .update({ status: "disconnected", access_token_encrypted: null })
      .eq("business_id", business.id)
      .eq("type", "instagram")
      .eq("page_id", page.id);
    warning =
      "Facebook quedó conectado. Esta página no tiene una cuenta de Instagram profesional vinculada, así que Instagram no se conectó.";
  }

  revalidatePath("/channels");
  return { warning };
}

async function saveChannel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  type: "facebook" | "instagram",
  externalId: string,
  fields: Record<string, unknown>,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("channels")
    .select("id")
    .eq("business_id", businessId)
    .eq("type", type)
    .eq("external_id", externalId)
    .limit(1)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("channels").update(fields).eq("id", existing.id)
    : await supabase.from("channels").insert({ business_id: businessId, type, external_id: externalId, ...fields });
  return error ? error.message : null;
}

// Disconnects a Page and its Instagram together: both go through the same
// Page connection. Owners only.
export async function disconnectMetaPage(pageId: string): Promise<{ error?: string }> {
  const owner = await ownerBusiness();
  if ("error" in owner) return { error: owner.error };
  const { business } = owner;

  const supabase = await createClient();
  const { data: channels } = await supabase
    .from("channels")
    .select("id, access_token_encrypted")
    .eq("business_id", business.id)
    .in("type", ["facebook", "instagram"])
    .eq("page_id", pageId);
  if (!channels || channels.length === 0) return { error: "No se encontró el canal." };

  // Best effort: stop Meta sending this Page's messages here.
  const encrypted = channels.find((c) => c.access_token_encrypted)?.access_token_encrypted;
  if (encrypted) {
    try {
      await fetch(`${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${decryptSecret(encrypted)}` },
      });
    } catch (e) {
      console.error("channels: could not unsubscribe page webhook", e);
    }
  }

  const { error } = await supabase
    .from("channels")
    .update({ status: "disconnected", access_token_encrypted: null })
    .eq("business_id", business.id)
    .in("type", ["facebook", "instagram"])
    .eq("page_id", pageId);
  if (error) return { error: error.message };

  revalidatePath("/channels");
  return {};
}
