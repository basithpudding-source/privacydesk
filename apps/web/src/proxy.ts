// Runs before every request: refreshes the Supabase session cookie and keeps signed-out
// visitors out of the app. Authorisation itself happens in the database (row-level
// security) and in the data-access layer, not here.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

// API routes check their own credentials (a session, or the inbound webhook's secret).
const PUBLIC_PREFIXES = ["/sign-in", "/auth/", "/api/"];

function isPublic(pathname: string) {
  return pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims verifies the token rather than trusting the cookie's contents.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/sign-in";
    target.search = pathname === "/clients" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return withCookies(NextResponse.redirect(target), supabaseResponse);
  }

  if (signedIn && pathname.startsWith("/sign-in")) {
    const target = request.nextUrl.clone();
    target.pathname = "/clients";
    target.search = "";
    return withCookies(NextResponse.redirect(target), supabaseResponse);
  }

  return supabaseResponse;
}

// A redirect must carry any refreshed cookies, or the user is signed out on the next hop.
function withCookies(response: NextResponse, from: NextResponse) {
  for (const cookie of from.cookies.getAll()) response.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) response.headers.set(header, value);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
