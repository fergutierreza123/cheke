"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ARCHIVED_STORE_READ_ONLY, canManageStore, canWriteToStore, getCurrentBusiness, type Role } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/dbErrors";

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
  const { data: changed, error } = await supabase
    .from("members")
    .update({ role })
    .eq("business_id", business.id)
    .eq("user_id", targetUserId)
    .select("user_id");
  if (error) return { error: friendlyError(error, "No se pudo cambiar el rol.") };
  if (!changed?.length) return { error: "Esa persona ya no está en tu negocio." };

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

  if (error) return { error: friendlyError(error, "No se pudo quitar a esta persona.") };
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
  void targetRole; // The browser's word for the role isn't trusted; read it below.
  const denied = { error: "No puedes cambiar las tiendas de esta persona." };
  if (!business.allStores.some((s) => s.id === storeId)) return denied;

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("members")
    .select("role")
    .eq("business_id", business.id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!target) return { error: "Esa persona ya no está en tu negocio." };
  const allowed =
    business.role === "owner" || (business.role === "manager" && target.role === "agent" && canManageStore(business, storeId));
  if (!allowed) return denied;
  // Taking someone out of an archived Tienda is fine; adding them isn't.
  if (inStore && !canWriteToStore(business, storeId)) return { error: ARCHIVED_STORE_READ_ONLY };

  const { error } = inStore
    ? await supabase.from("store_members").insert({ store_id: storeId, business_id: business.id, user_id: targetUserId })
    : await supabase.from("store_members").delete().eq("store_id", storeId).eq("user_id", targetUserId);
  if (error && error.code !== "23505") return { error: friendlyError(error, "No se pudo cambiar la tienda de esta persona.") };
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
  if (error || !data) return { error: friendlyError(error, "No se pudo crear la invitación.") };
  revalidatePath("/team");
  return { token: data as string };
}

// "Ausente": receives no new conversations (keeps the open ones). Yourself;
// a Dueño for anyone; a Gerente for the Agentes of their Tiendas (the
// database function checks the same rules).
export async function setMemberAway(targetUserId: string, away: boolean): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_away", {
    p_business_id: business.id,
    p_user_id: targetUserId,
    p_away: away,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/team");
  return {};
}

// Dueños: "avisarme de todo" — also the chats of other people and of chekelin.
export async function setNotifyAll(on: boolean): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_notify_all", { p_business_id: business.id, p_on: on });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/team");
  return {};
}

export async function cancelInvitation(invitationId: string): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };
  const supabase = await createClient();
  // RLS: unused ones only, and a Gerente only the ones they made.
  const { data: cancelled, error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId)
    .eq("business_id", business.id)
    .select("id");
  if (error) return { error: friendlyError(error) };
  if (!cancelled?.length) return { error: "Esta invitación ya se usó o ya no existe." };
  revalidatePath("/team");
  return {};
}
