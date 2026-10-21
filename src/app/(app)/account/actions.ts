"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DELETE_CONFIRM_WORD, getDeletionPlan, type DeletionPlanItem } from "./deletion";

// Ends this browser's/phone's session and sends the person back to the login
// screen. Only this device is signed out, not their other devices.
export async function signOut() {
  const supabase = await createClient();
  // Stop customer-message alerts on the phone(s) this person signed in on;
  // the app registers again the next time they open it signed in.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("device_tokens").delete().eq("user_id", user.id);
  // "local": only this device's session ends. The default ("global") would
  // also sign the person out of their other phones and computers.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

// The name shown in the side menu and on the account page. Stored in the
// sign-in profile (Google accounts already have one; email-only accounts
// start without) so it needs no database change.
export async function updateDisplayName(name: string): Promise<{ error?: string }> {
  const fullName = name.trim().replace(/\s+/g, " ");
  if (!fullName) return { error: "Escribe tu nombre." };
  if (fullName.length > 60) return { error: "El nombre es muy largo (máximo 60 letras)." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
  if (error) return { error: "No se pudo guardar tu nombre. Inténtalo de nuevo." };

  revalidatePath("/", "layout");
  return {};
}

const LIST_PAGE = 1000;

// Every file under `prefix` in a Storage bucket, folders included (Storage
// lists one level at a time, a page at a time; folders come without an id).
async function removeFolder(admin: ReturnType<typeof createAdminClient>, bucketName: string, prefix: string): Promise<void> {
  const bucket = admin.storage.from(bucketName);
  const files: string[] = [];
  const folders: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data } = await bucket.list(prefix, { limit: LIST_PAGE, offset });
    for (const entry of data ?? []) (entry.id ? files : folders).push(`${prefix}/${entry.name}`);
    if (!data || data.length < LIST_PAGE) break;
  }
  for (let i = 0; i < files.length; i += LIST_PAGE) await bucket.remove(files.slice(i, i + LIST_PAGE));
  for (const folder of folders) await removeFolder(admin, bucketName, folder);
}

// "Eliminar mi cuenta" (required by Apple 5.1.1(v) and Google Play). Deletes
// the signed-in person's sign-in account right away, plus:
// - their memberships and phone-alert tokens in every Negocio,
// - any Negocio where they were the only member, with all its data
//   (contacts, conversations, catalog, product photos, channels…),
// and refuses when they are the only Dueño of a Negocio that still has
// other people on its team.
// The admin (service-role) client is used only after confirming who is
// signed in, and only for rows that belong to that person or to a Negocio
// they alone make up.
export async function deleteAccount(confirmation: string): Promise<{ error?: string }> {
  if (confirmation.trim().toUpperCase() !== DELETE_CONFIRM_WORD) {
    return { error: `Escribe ${DELETE_CONFIRM_WORD} para confirmar.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión terminó. Vuelve a iniciar sesión e inténtalo de nuevo." };

  const admin = createAdminClient();
  let plan: DeletionPlanItem[];
  try {
    plan = await getDeletionPlan(admin, user.id);
  } catch {
    return { error: "No se pudo eliminar tu cuenta. Inténtalo de nuevo." };
  }

  const blocked = plan.find((b) => b.outcome === "blocked");
  if (blocked) {
    return {
      error: `Eres el único dueño de ${blocked.businessName}. Antes de eliminar tu cuenta, haz dueño a otra persona en Equipo.`,
    };
  }

  // Negocios where this person is the only member go away entirely. Deleting
  // the row cascades to every table that has business_id. Files live in
  // Storage, outside the database, so remove them first: product photos
  // (product-images/<negocio>/…) and the customers' photos, voice notes and
  // documents (message-media/<negocio>/<tienda>/…).
  for (const business of plan.filter((b) => b.outcome === "delete")) {
    await removeFolder(admin, "product-images", business.businessId);
    await removeFolder(admin, "message-media", business.businessId);

    const { error } = await admin.from("businesses").delete().eq("id", business.businessId);
    if (error) return { error: "No se pudo eliminar tu negocio. Inténtalo de nuevo." };
  }

  // Explicit cleanup (deleting the sign-in account also cascades to these).
  await admin.from("device_tokens").delete().eq("user_id", user.id);
  await admin.from("members").delete().eq("user_id", user.id);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "No se pudo eliminar tu cuenta. Inténtalo de nuevo." };

  // Clear this browser's session cookies. The account no longer exists, so
  // Supabase may answer with an error; the local session is removed anyway.
  await supabase.auth.signOut().catch(() => {});
  redirect("/eliminar-datos?cuenta=eliminada");
}
