import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isNativeAppUserAgent, NATIVE_APP_HOME } from "@/lib/nativeApp";

// Handles the magic-link redirect: exchanges the one-time code for a session,
// then sends the user into the app (or to onboarding if they have no business yet).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // The installed phone app opens on the inbox; the web on Chekeo.
      const home = isNativeAppUserAgent(request.headers.get("user-agent")) ? NATIVE_APP_HOME : "/chekeo";
      const response = NextResponse.redirect(`${origin}${home}`);
      // One-shot flag: the app layout shows the welcome screen once, then the
      // screen clears the cookie (see WelcomeSplash).
      response.cookies.set("cheke_welcome", "1", { path: "/", maxAge: 120, sameSite: "lax" });
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
