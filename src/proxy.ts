import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Next.js 16 renamed "Middleware" to "Proxy" (same mechanism, this file runs
// before every request). See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
// This is an *optimistic* check only — it just reads/refreshes the Supabase
// session cookie. The real security boundary is Postgres Row Level Security
// (supabase/migrations/0001_init.sql), not this file.

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function proxy(request: NextRequest) {
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

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/chekeo";
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
