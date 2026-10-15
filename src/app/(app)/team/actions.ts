"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageStore, getCurrentBusiness, type Role } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";

// A business must always keep at least one owner, or nobody could manage it.
// (The database enforces it too; this gives the friendly message first.)
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

const ROLES: Role[] = ["owner", "manager", "agent"];

// Only Dueños change roles (only they may invite Gerentes and Dueños).
export async function updateMemberRole(targetUserId: string, role: Role): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (business.role !== "owner") return { error: "Solo el dueño puede cambiar roles." };
  if (!ROLES.includes(role)) return { error: "Rol inválido." };

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

  // A Gerente or Agente only sees the Tiendas they're in. Someone who had
  // none (e.g. a Dueño becoming Agente) starts in every open Tienda; the
  // Dueño can then take them out of the ones that don't apply.
  if (role !== "owner") {
    const { count } = await supabase
      .from("store_members")
      .select("store_id", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .eq("business_id", business.id);
    if (!count && business.stores.length > 0) {
      await supabase
        .from("store_members")
        .insert(business.stores.map((s) => ({ store_id: s.id, business_id: business.id, user_id: targetUserId })));
    }
  }

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

// Puts a Gerente/Agente in a Tienda or takes them out. Dueños for anyone;
// a Gerente only Agentes, only in their own Tiendas. Their open
// conversations in a Tienda they leave become unassigned (database trigger).
export async function setMemberStore(
  targetUserId: string,
  targetRole: Role,
  storeId: string,
  inStore: boolean,
): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  const allowed =
    business.role === "owner" || (business.role === "manager" && targetRole === "agent" && canManageStore(business, storeId));
  if (!allowed) return { error: "No puedes cambiar las tiendas de esta persona." };

  const supabase = await createClient();
  const { error } = inStore
    ? await supabase.from("store_members").insert({ store_id: storeId, business_id: business.id, user_id: targetUserId })
    : await supabase.from("store_members").delete().eq("store_id", storeId).eq("user_id", targetUserId);
  if (error && error.code !== "23505") return { error: error.message };
  revalidatePath("/team");
  return {};
}

// A single-use invitation link (valid 7 days) carrying a role and Tiendas.
// Dueños invite anyone; Gerentes only Agentes, only to their own Tiendas
// (the database function checks the same rules). Returns the link's secret;
// the page builds the full link.
export async function createInvitation(role: Role, storeIds: string[]): Promise<{ token?: string; error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  if (!ROLES.includes(role)) return { error: "Rol inválido." };

  // One Tienda to choose from (always the case with a single Tienda): it's
  // that one, without asking.
  const manageable = business.stores.filter((s) => canManageStore(business, s.id));
  const stores = role === "owner" ? [] : storeIds.length > 0 ? storeIds : manageable.length === 1 ? [manageable[0].id] : [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_business_id: business.id,
    p_role: role,
    p_store_ids: stores,
  });
  if (error || !data) return { error: error?.message ?? "No se pudo crear la invitación." };
  revalidatePath("/team");
  return { token: data as string };
}

export async function cancelInvitation(invitationId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", invitationId).eq("business_id", business.id);
  if (error) return { error: error.message };
  revalidatePath("/team");
  return {};
}
