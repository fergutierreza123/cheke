import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron";
import { runTimers } from "@/lib/bot";

// The 5 and 10 minute timers (Vercel Cron, every minute — see vercel.json).
// Webhooks only run when a message arrives, so "nobody has replied in 5
// minutes" needs this clock. Safe to run twice at once: each step claims its
// conversation before acting.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const result = await runTimers(createAdminClient());
  if (result.error) console.error("chekelin timers error", result.error);
  return NextResponse.json(result);
}
