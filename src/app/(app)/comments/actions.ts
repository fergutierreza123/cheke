"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessStore, getCurrentBusiness } from "@/lib/business";
import { answerCommentPrivately, answerCommentPublicly } from "@/lib/commentsServer";
import { PRIVATE_REPLY_MAX, PUBLIC_REPLY_MAX } from "@/lib/comments";

// The person can see the comment (RLS: their Tiendas) and works in its Tienda.
async function access(commentId: string) {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." } as const;
  const supabase = await createClient();
  const { data: comment } = await supabase.from("post_comments").select("id, store_id").eq("id", commentId).maybeSingle();
  if (!comment || !canAccessStore(business, comment.store_id)) return { error: "No se encontró el comentario." } as const;
  return { business } as const;
}

// "Responder": a public reply under the comment, as the Page / account.
export async function replyToCommentPublicly(commentId: string, text: string): Promise<{ error?: string }> {
  const body = text.trim();
  if (!body) return { error: "Escribe la respuesta." };
  if (body.length > PUBLIC_REPLY_MAX) return { error: "La respuesta es muy larga." };
  const ctx = await access(commentId);
  if ("error" in ctx) return { error: ctx.error };
  const result = await answerCommentPublicly(createAdminClient(), commentId, body, ctx.business.userId);
  revalidatePath("/comments");
  return result;
}

// "Enviar por privado": the one private reply Meta allows per comment; it
// opens a chat in Chat.
export async function replyToCommentPrivately(
  commentId: string,
  text: string,
): Promise<{ error?: string; conversationId?: string | null }> {
  const body = text.trim();
  if (!body) return { error: "Escribe el mensaje." };
  if (body.length > PRIVATE_REPLY_MAX) return { error: "El mensaje es muy largo." };
  const ctx = await access(commentId);
  if ("error" in ctx) return { error: ctx.error };
  const result = await answerCommentPrivately(createAdminClient(), commentId, body, ctx.business.userId);
  revalidatePath("/comments");
  revalidatePath("/chat");
  return result;
}
