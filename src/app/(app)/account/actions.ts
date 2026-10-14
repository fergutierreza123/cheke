"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  await supabase.auth.signOut();
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
