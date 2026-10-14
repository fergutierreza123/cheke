"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";

// A business must always keep at least one owner, or nobody could manage it.
async function otherOwnersExist(businessId: string, exceptUserId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("members")
    .select("user_id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("role", "owner")
    .neq("user_id", exceptUserId);
  return (count ?? 0) > 0;
}

export async function updateMemberRole(
  targetUserId: string,
  role: "owner" | "agent",
): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role !== "owner") return { error: "Solo el dueño puede cambiar roles." };

  if (role !== "owner" && !(await otherOwnersExist(business.id, targetUserId))) {
    return { error: "El negocio debe tener al menos un dueño." };
  }

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

  if (!(await otherOwnersExist(business.id, targetUserId))) {
    return { error: "El negocio debe tener al menos un dueño." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .delete()
    .eq("business_id", business.id)
    .eq("user_id", targetUserId);

  if (error) return { error: error.message };
  // They must stop receiving this business's customer messages on their phone.
  // Admin client: an owner can't touch another person's token rows directly.
  await createAdminClient().from("device_tokens").delete().eq("user_id", targetUserId).eq("business_id", business.id);
  revalidatePath("/team");
  return {};
}
