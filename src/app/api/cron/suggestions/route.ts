import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron";
import { runWeeklySuggestions } from "@/lib/suggestions";

// "Sugerencias de chekelin" (Vercel Cron, once a day — see vercel.json).
// Each Negocio is looked at once a week; a daily run just spreads the work.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json(await runWeeklySuggestions(createAdminClient()));
}
