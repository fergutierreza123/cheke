import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron";
import { runChannelHealth } from "@/lib/channelHealth";
import { syncWhatsAppTemplates } from "@/lib/whatsappTemplatesServer";

// Canal connection check (Vercel Cron, once a day — see vercel.json): warns
// the Dueños and Gerentes ~7 days before a Canal's Meta token ends, marks
// "Reconectar" once it has ended, and checks META_SYSTEM_USER_TOKEN is still
// valid (issue #56). Then refreshes every WhatsApp number's message templates
// (approved / in review / rejected) for "Enviar plantilla" in Chat.
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const health = await runChannelHealth(admin);
  // Best effort: a template sync problem never hides the health result.
  const templates = await syncWhatsAppTemplates(admin, null).catch((e) => ({ error: String(e) }));
  return NextResponse.json({ ...health, templates });
}
