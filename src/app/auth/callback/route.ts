import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the magic-link redirect: exchanges the one-time code for a session,
// then sends the user into the app (or to onboarding if they have no business yet).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(`${origin}/chekeo`);
      // One-shot flag: the app layout shows the welcome screen once, then the
      // screen clears the cookie (see WelcomeSplash).
      response.cookies.set("cheke_welcome", "1", { path: "/", maxAge: 120, sameSite: "lax" });
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
