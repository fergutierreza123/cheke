import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron";
import { drainPrivateReplies, processMissedComments } from "@/lib/commentsServer";

// Comentarios (issue #43), every minute (vercel.json): sends the private
// replies waiting in the queue (Meta allows 750 per hour per account) and
// handles any comment the webhook saved but couldn't finish. Safe to run
// twice at once: each comment and each reply is claimed before acting.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const supabase = createAdminClient();
  const missed = await processMissedComments(supabase).catch((error) => {
    console.error("comments catch-up error", error);
    return 0;
  });
  const { sent } = await drainPrivateReplies(supabase);
  return NextResponse.json({ missed, sent });
}
