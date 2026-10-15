"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkReviewerCredentials, prepareReviewerDemo, reviewerLoginEnabled } from "@/lib/reviewerDemo";
import { NATIVE_APP_HOME } from "@/lib/nativeApp";

export type ReviewerLoginState = { error?: string };

const WRONG = "Correo o contraseña incorrectos.";

// "Acceso para revisores": signs the App Store / Google Play reviewer into
// the demo Negocio with the fixed email + password set in REVIEWER_EMAIL /
// REVIEWER_PASSWORD. Anything else gets the same generic error after a
// short pause, so this can't be used to probe accounts or guess quickly.
export async function reviewerSignIn(_prev: ReviewerLoginState, formData: FormData): Promise<ReviewerLoginState> {
  if (!reviewerLoginEnabled()) return { error: "El acceso para revisores no está activo." };

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const creds = checkReviewerCredentials(email, password);
  if (!creds) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { error: WRONG };
  }

  const prepared = await prepareReviewerDemo(creds);
  if (prepared.error) return { error: prepared.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: creds.email, password: creds.password });
  if (error) {
    console.error("reviewer sign-in failed", error.message);
    return { error: "No se pudo iniciar sesión. Intenta de nuevo." };
  }

  redirect(NATIVE_APP_HOME);
}
