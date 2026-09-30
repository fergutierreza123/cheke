"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";

export async function updateMemberRole(
  targetUserId: string,
  role: "owner" | "agent",
): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role !== "owner") return { error: "Solo el dueño puede cambiar roles." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ role })
    .eq("business_id", business.id)
    .eq("user_id", targetUserId);

  if (error) return { error: error.message };
  revalidatePath("/team");
  return {};
}

export async function removeMember(targetUserId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role !== "owner") return { error: "Solo el dueño puede quitar miembros." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .delete()
    .eq("business_id", business.id)
    .eq("user_id", targetUserId);

  if (error) return { error: error.message };
  revalidatePath("/team");
  return {};
}
