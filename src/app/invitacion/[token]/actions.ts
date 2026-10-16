"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NATIVE_APP_HOME } from "@/lib/nativeApp";
import { INVITE_COOKIE } from "@/lib/invitations";

// "Unirme": joins the Negocio with the invitation's role and Tiendas (the
// database function checks it's unused, not expired, and that this account
// isn't already in a Negocio).
export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  (await cookies()).delete(INVITE_COOKIE);
  if (error) {
    redirect(`/invitacion/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(NATIVE_APP_HOME);
}
