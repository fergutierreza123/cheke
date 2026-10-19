"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/dbErrors";

export type OnboardingState = { error?: string };

// The one first-time screen: "Tu nombre" + "Nombre de tu negocio", then
// Empezar. Saves the name on the sign-in profile (what the team sees, also
// editable in Mi cuenta) and creates the Negocio with its first Tienda.
export async function createBusiness(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const fullName = String(formData.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!fullName) return { error: "Escribe tu nombre." };
  if (fullName.length > 60) return { error: "Tu nombre es muy largo (máximo 60 letras)." };
  if (!name) return { error: "Ponle un nombre a tu negocio." };
  if (name.length > 80) return { error: "El nombre del negocio es muy largo (máximo 80 letras)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error: nameError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
  if (nameError) return { error: "No se pudo guardar tu nombre. Inténtalo de nuevo." };

  const { error } = await supabase.rpc("create_business", { business_name: name });
  if (error) return { error: friendlyError(error, "No se pudo crear tu negocio. Inténtalo de nuevo.") };

  redirect("/chat");
}

// Joining an existing Negocio is by invitation link only (see
// src/app/invitacion), which replaced the shared invite code.
