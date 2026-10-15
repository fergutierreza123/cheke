"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createBusiness(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/onboarding?error=" + encodeURIComponent("Ponle un nombre a tu negocio."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_business", { business_name: name });

  if (error) {
    redirect("/onboarding?error=" + encodeURIComponent(error.message));
  }

  redirect("/chekeo");
}

// Joining an existing Negocio is by invitation link only (see
// src/app/invitacion), which replaced the shared invite code.
