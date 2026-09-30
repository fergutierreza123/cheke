import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for server-only code that has no logged-in user to
// authenticate as — right now just the WhatsApp webhook, which is called by
// Meta's servers, not by someone with a Cheke session. Bypasses Row Level
// Security entirely, so every query here must scope by business_id itself.
// NEVER import this file from a "use client" component or a Server Action
// that runs on behalf of a signed-in user — use lib/supabase/server.ts there.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
