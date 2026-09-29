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

export async function joinBusiness(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toLowerCase();
  if (!code) {
    redirect("/onboarding?error=" + encodeURIComponent("Ingresa un código de invitación."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("join_business_by_code", { code });

  if (error) {
    redirect("/onboarding?error=" + encodeURIComponent("No encontramos un negocio con ese código."));
  }

  redirect("/chekeo");
}
