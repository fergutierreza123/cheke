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

  // One row per phone token; if the same phone is now used by someone else
  // (or another business), the row simply moves to them.
  const { error } = await supabase
    .from("device_tokens")
    .upsert(
      { user_id: user.id, business_id: business.id, token, platform, last_seen_at: new Date().toISOString() },
      { onConflict: "token" },
    );
  return error ? { error: error.message } : {};
}
