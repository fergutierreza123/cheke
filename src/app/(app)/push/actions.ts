"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";

// Called by the installed iPhone/Android app after the user allows
// notifications, to remember this phone's push address for their business.
export async function registerDeviceToken(token: string, platform: "ios" | "android"): Promise<{ error?: string }> {
  if (!token || (platform !== "ios" && platform !== "android")) return { error: "Datos inválidos." };

  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No has iniciado sesión." };

  // The database function moves the phone's token to whoever is signed in
  // now (even if the phone was last used by another person or business).
  const { error } = await supabase.rpc("register_device_token", {
    p_token: token,
    p_platform: platform,
    p_business_id: business.id,
  });
  return error ? { error: error.message } : {};
}
