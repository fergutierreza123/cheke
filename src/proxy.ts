import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { NATIVE_APP_HOME } from "@/lib/nativeApp";
import { INVITE_COOKIE, isInviteToken } from "@/lib/invitations";
import { APP_URL, isSiteHost, SITE_PATHS } from "@/lib/site";

// Next.js 16 renamed "Middleware" to "Proxy" (same mechanism, this file runs
// before every request). See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
// This is an *optimistic* check only — it just reads/refreshes the Supabase
// session cookie. The real security boundary is Postgres Row Level Security
// (supabase/migrations/0001_init.sql), not this file.

// Public = reachable without signing in. "/" is matched exactly (the home page
// decides for itself whether to show the landing or send you into the app);
// the rest match by prefix.
const PUBLIC_PATHS = ["/login", "/demo", "/privacidad", "/terminos", "/eliminar-datos"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // cheke.io is the informational site: it serves its own pages with no
  // session, and sends everything else to the app (ventas.cheke.app).
  if (isSiteHost(request.headers.get("host"))) {
    if (SITE_PATHS.includes(pathname)) return NextResponse.next({ request });
    return NextResponse.redirect(`${APP_URL}${pathname}${search}`, 308);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // An invitation link opened while signed out: remember it, so after
    // logging in onboarding sends the person back to it.
    const invite = pathname.match(/^\/invitacion\/([^/]+)$/)?.[1];
    if (isInviteToken(invite)) {
      redirect.cookies.set(INVITE_COOKIE, invite, { path: "/", maxAge: 24 * 60 * 60, sameSite: "lax", httpOnly: true });
    }
    return redirect;
  }

  // Signed in: everyone lands on Chat (web and phone app alike). Only when
  // the page is opened: right after a code is verified, finishSignIn (a
  // POST to /login) must run here, or the login hangs on "Entrando…".
  if (user && pathname === "/login" && request.method === "GET") {
    const url = request.nextUrl.clone();
    url.pathname = NATIVE_APP_HOME;
    return NextResponse.redirect(url);
  }

  // On the app's own domain the home page is the app, not the marketing
  // page (that lives on cheke.io).
  if (APP_URL && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? NATIVE_APP_HOME : "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Excludes /api entirely: those routes (like the WhatsApp webhook) are
  // called by external services with no browser session, and verify
  // themselves however's appropriate (e.g. a signature header), not a
  // Supabase session cookie.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
