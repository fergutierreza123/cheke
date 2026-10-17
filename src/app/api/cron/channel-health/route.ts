import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron";
import { runChannelHealth } from "@/lib/channelHealth";

// Canal connection check (Vercel Cron, once a day — see vercel.json): warns
// the Dueños and Gerentes ~7 days before a Canal's Meta token ends, marks
// "Reconectar" once it has ended, and checks META_SYSTEM_USER_TOKEN is still
// valid (issue #56).
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json(await runChannelHealth(createAdminClient()));
}
