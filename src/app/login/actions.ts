"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INVITE_COOKIE, invitationErrorCode, isInviteToken } from "@/lib/invitations";

// Runs right after the browser verified a login code (SMS or email) and
// has its session cookies. Decides where the person goes:
// 1. They came from an invitation link (remembered by src/proxy.ts): join
//    that Negocio/Tienda directly.
// 2. No Negocio yet: the one-screen onboarding (name + business name).
// 3. Otherwise: straight to Chat.
export async function finishSignIn(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No se pudo iniciar sesión. Intenta de nuevo." };

  const jar = await cookies();
  const invite = jar.get(INVITE_COOKIE)?.value;
  if (isInviteToken(invite)) {
    const { error } = await supabase.rpc("accept_invitation", { p_token: invite });
    jar.delete(INVITE_COOKIE);
    // Used, expired, or already in a Negocio: the invitation page explains it.
    if (error) redirect(`/invitacion/${invite}?error=${invitationErrorCode(error.message)}`);
    redirect("/chat");
  }

  const { data: membership } = await supabase.from("members").select("business_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");

  // One-shot flag: the app layout shows the welcome screen once, then the
  // screen clears the cookie (see WelcomeSplash).
  jar.set("cheke_welcome", "1", { path: "/", maxAge: 120, sameSite: "lax" });
  redirect("/chat");
}
