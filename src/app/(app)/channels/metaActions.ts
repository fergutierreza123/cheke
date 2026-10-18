"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageStore, getCurrentBusiness } from "@/lib/business";
import { friendlyError } from "@/lib/dbErrors";
import { claimExternalId, unsubscribeMetaPage } from "./channelHelpers";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { GRAPH_API_VERSION } from "@/lib/meta";
import { PAGE_OPTIONAL_FIELDS, PAGE_SUBSCRIBED_FIELDS } from "@/lib/metaMessaging";
import { debugToken, freshConnectionFields } from "@/lib/channelHealth";
import { grantedPageIds } from "@/lib/metaTokens";

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
// Dueños, and Gerentes of the Tienda the channels are connected to.

export type MetaPageOption = { id: string; name: string; instagram: { id: string; username: string | null } | null };

type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
};

const SESSION_TTL_MS = 15 * 60 * 1000;

async function managerOf(storeId: string) {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." } as const;
  if (!canManageStore(business, storeId) || business.allStores.find((s) => s.id === storeId)?.archived) {
    return { error: "Solo el dueño del negocio o un gerente pueden conectar canales." } as const;
  }
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
    const pages: MetaPage[] = data?.data ?? [];
    if (pages.length > 0) return { pages };
    return { pages: await grantedPages(token, fields) };
  } catch {
    return { error: "No se pudo contactar a Meta. Revisa tu conexión e intenta de nuevo." };
  }
}

// A System-user token ("General + System-user + Never" configuration) may
// list no Pages under /me/accounts. It still says which Pages it was granted
// (debug_token's granular_scopes), and each one can be read directly:
// GET /<PAGE_ID>?fields=…,access_token.
async function grantedPages(token: string, fields: string): Promise<MetaPage[]> {
  const info = await debugToken(token);
  const ids = grantedPageIds(info?.granularScopes).slice(0, 25);
  const pages = await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(`${GRAPH}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        const page = res.ok ? await res.json().catch(() => null) : null;
        return page?.id ? (page as MetaPage) : null;
      } catch {
        return null;
      }
    }),
  );
  return pages.filter((p): p is MetaPage => p !== null);
}

export async function startMetaConnection(
  code: string,
  storeId: string,
): Promise<{ error?: string; session?: string; pages?: MetaPageOption[] }> {
  const owner = await managerOf(storeId);
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
  // (system user) token, from the "General + System-user + Never"
  // configuration, never expires on its own and Meta just rejects this.
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
    JSON.stringify({ token, businessId: owner.business.id, storeId, expiresAt: Date.now() + SESSION_TTL_MS }),
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
  let token: string;
  let storeId: string;
  let businessId: string;
  try {
    const parsed = JSON.parse(decryptSecret(session)) as { token: string; businessId: string; storeId: string; expiresAt: number };
    if (!parsed.storeId || parsed.expiresAt < Date.now()) throw new Error("expired");
    token = parsed.token;
    storeId = parsed.storeId;
    businessId = parsed.businessId;
  } catch {
    return { error: "La autorización de Meta venció. Vuelve a tocar \"Conectar Instagram y Facebook\"." };
  }
  // The session was started in this Negocio, for a Tienda this person manages.
  const owner = await managerOf(storeId);
  if ("error" in owner) return { error: owner.error };
  const { business } = owner;
  if (businessId !== business.id) {
    return { error: "La autorización de Meta venció. Vuelve a tocar \"Conectar Instagram y Facebook\"." };
  }

  // Never trust the id from the browser: it must be one of this person's Pages.
  const { pages, error: listError } = await listPages(token, true);
  if (listError || !pages) return { error: listError };
  const page = pages.find((p) => p.id === pageId);
  if (!page) return { error: "Esa página no pertenece a tu cuenta de Facebook." };
  const pageToken = page.access_token ?? (await pageTokenFor(token, page.id));
  if (!pageToken) {
    return { error: "Meta no dio permiso para responder mensajes de esa página. Revisa que seas administrador de la página." };
  }
  const instagram = page.instagram_business_account ?? null;
  // When the Page token ends: null ("never") for a Page token from a
  // long-lived user token or a System-user token, which is what we want.
  const tokenInfo = await debugToken(pageToken);

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
  if (subscribeError) subscribeError = await subscribe(PAGE_SUBSCRIBED_FIELDS.filter((f) => !PAGE_OPTIONAL_FIELDS.includes(f)));
  if (subscribeError) return { error: subscribeError };

  let warning: string | undefined;
  const supabase = await createClient();
  const common = {
    page_id: page.id,
    access_token_encrypted: encryptSecret(pageToken),
    // The client's own token (long-lived user or System-user), kept
    // encrypted so a Page token Meta stops accepting can be regenerated
    // without asking the client to reconnect (src/lib/channelHealth.ts).
    credential_token_encrypted: encryptSecret(token),
    status: "connected",
    connected_at: new Date().toISOString(),
    ...freshConnectionFields(tokenInfo),
  };

  const facebookError = await saveChannel(supabase, business.id, storeId, "facebook", page.id, {
    ...common,
    verified_name: page.name ?? null,
  });
  if (facebookError) return { error: facebookError };

  if (instagram) {
    const instagramError = await saveChannel(supabase, business.id, storeId, "instagram", instagram.id, {
      ...common,
      verified_name: instagram.username ? `@${instagram.username}` : null,
    });
    if (instagramError) warning = `Facebook quedó conectado, pero Instagram no: ${instagramError}`;
  } else {
    // The Page no longer has an Instagram linked: stop using the old one.
    await supabase
      .from("channels")
      .update({ status: "disconnected", access_token_encrypted: null, credential_token_encrypted: null })
      .eq("business_id", business.id)
      .eq("store_id", storeId)
      .eq("type", "instagram")
      .eq("page_id", page.id);
    warning =
      "Facebook quedó conectado. Esta página no tiene una cuenta de Instagram profesional vinculada, así que Instagram no se conectó.";
  }

  revalidatePath("/channels");
  return { warning };
}

// A Page's token straight from the Page (GET /<PAGE_ID>?fields=access_token),
// for when the Page list didn't include it.
async function pageTokenFor(token: string, pageId: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(pageId)}?fields=access_token`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return typeof data?.access_token === "string" ? data.access_token : null;
  } catch {
    return null;
  }
}

async function saveChannel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  storeId: string,
  type: "facebook" | "instagram",
  externalId: string,
  fields: Record<string, unknown>,
): Promise<string | null> {
  const claimError = await claimExternalId(businessId, storeId, type, externalId);
  if (claimError) return claimError;
  const { data: existing } = await supabase
    .from("channels")
    .select("id")
    .eq("business_id", businessId)
    .eq("store_id", storeId)
    .eq("type", type)
    .eq("external_id", externalId)
    .limit(1)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("channels").update(fields).eq("id", existing.id)
    : await supabase
        .from("channels")
        .insert({ business_id: businessId, store_id: storeId, type, external_id: externalId, ...fields });
  return error ? friendlyError(error, "No se pudo guardar la conexión.") : null;
}

// Disconnects a Page and its Instagram together: both go through the same
// Page connection. Dueños and the Tienda's Gerentes.
export async function disconnectMetaPage(pageId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const supabase = await createClient();
  const { data: channels } = await supabase
    .from("channels")
    .select("id, store_id, access_token_encrypted")
    .eq("business_id", business.id)
    .in("type", ["facebook", "instagram"])
    .eq("page_id", pageId);
  if (!channels || channels.length === 0) return { error: "No se encontró el canal." };
  const storeIds = Array.from(new Set(channels.map((c) => c.store_id as string)));
  if (!storeIds.every((id) => canManageStore(business, id))) {
    return { error: "Solo el dueño del negocio o un gerente pueden desconectar canales." };
  }

  await unsubscribeMetaPage(pageId, channels.find((c) => c.access_token_encrypted)?.access_token_encrypted ?? null);

  const { error } = await supabase
    .from("channels")
    .update({ status: "disconnected", access_token_encrypted: null, credential_token_encrypted: null })
    .eq("business_id", business.id)
    .in("store_id", storeIds)
    .in("type", ["facebook", "instagram"])
    .eq("page_id", pageId);
  if (error) return { error: friendlyError(error, "No se pudo desconectar el canal.") };

  revalidatePath("/channels");
  return {};
}
