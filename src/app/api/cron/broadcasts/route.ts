import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron";
import { runBroadcasts } from "@/lib/broadcastsServer";

// Campaña (migration 0042), every minute (vercel.json): sends the next
// customers of every Campaña in progress, within each Negocio's 24 h limit.
// Safe to run twice at once: each customer is claimed before sending.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json(await runBroadcasts(createAdminClient()));
}
