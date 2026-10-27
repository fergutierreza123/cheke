"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { BODY_MAX, normalizeShortcut, parsePastedReplies } from "@/lib/quickReplies";
import { friendlyError } from "@/lib/dbErrors";

const ONLY_MANAGERS = "Solo el dueño o un gerente puede cambiar las respuestas rápidas.";

async function managerContext() {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." } as const;
  if (business.role === "agent") return { error: ONLY_MANAGERS } as const;
  return { business, supabase: await createClient() } as const;
}

function refresh() {
  revalidatePath("/templates/respuestas");
  revalidatePath("/chat");
}

// Create (no id) or edit one Respuesta rápida. Dueños and Gerentes only
// (checked here and again by the database's RLS).
export async function saveQuickReply(input: { id?: string; shortcut: string; body: string }): Promise<{ error?: string }> {
  const ctx = await managerContext();
  if ("error" in ctx) return { error: ctx.error };
  const shortcut = normalizeShortcut(input.shortcut);
  const body = input.body.trim();
  if (!shortcut) return { error: "Ponle un atajo, por ejemplo: horario." };
  if (!body) return { error: "Escribe el mensaje." };
  if (body.length > BODY_MAX) return { error: `El mensaje es muy largo (máximo ${BODY_MAX} letras).` };

  const row = { shortcut, body };
  const { data, error } = input.id
    ? await ctx.supabase.from("quick_replies").update(row).eq("id", input.id).eq("business_id", ctx.business.id).select("id")
    : await ctx.supabase.from("quick_replies").insert({ ...row, business_id: ctx.business.id }).select("id");
  if (error) {
    if (error.code === "23505") return { error: `Ya tienes una respuesta con /${shortcut}.` };
    return { error: friendlyError(error, "No se pudo guardar la respuesta rápida.") };
  }
  if (input.id && !data?.length) return { error: "No se encontró la respuesta rápida. Recarga la página." };
  refresh();
  return {};
}

export async function deleteQuickReply(id: string): Promise<{ error?: string }> {
  const ctx = await managerContext();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.from("quick_replies").delete().eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { error: friendlyError(error, "No se pudo guardar. Inténtalo de nuevo.") };
  refresh();
  return {};
}

// "Pegar varias": saves every "/atajo texto" in the pasted text. An atajo
// that already exists gets the new text.
export async function importQuickReplies(text: string): Promise<{ error?: string; saved?: number }> {
  const ctx = await managerContext();
  if ("error" in ctx) return { error: ctx.error };
  const replies = parsePastedReplies(text);
  if (replies.length === 0) return { error: "No encontramos respuestas. Empieza cada una con / y su atajo." };
  if (replies.length > 200) return { error: "Son demasiadas de una vez (máximo 200)." };
  const { error } = await ctx.supabase
    .from("quick_replies")
    .upsert(
      replies.map((r) => ({ ...r, business_id: ctx.business.id })),
      { onConflict: "business_id,shortcut" },
    );
  if (error) return { error: friendlyError(error, "No se pudo guardar. Inténtalo de nuevo.") };
  refresh();
  return { saved: replies.length };
}
