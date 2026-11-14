// Runs before every request: refreshes the Supabase session cookie, ends idle sessions and
// keeps signed-out visitors out of the app. Authorisation itself happens in the database
// (row-level security) and in the data-access layer, not here.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { idleHours, isIdle, LAST_ACTIVE_COOKIE } from "@/lib/security/session";
import { supabaseEnv } from "@/lib/supabase/env";

// API routes check their own credentials (a session, or the inbound webhook's secret).
// /r/<code> is the public request form; the legal pages are public too.
// /mailbox-redirect only hands Microsoft's sign-in answer back to the window that asked for it.
const PUBLIC_PREFIXES = ["/sign-in", "/auth/", "/api/", "/r/", "/terms", "/privacy", "/dpa", "/sub-processors", "/mailbox-redirect"];

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
  let signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;
  const now = Date.now();

  // Idle sessions end here, whatever Supabase's own token lifetime says.
  if (signedIn) {
    const last = Number(request.cookies.get(LAST_ACTIVE_COOKIE)?.value);
    if (isIdle(last, now, idleHours())) {
      await supabase.auth.signOut();
      signedIn = false;
      const target = request.nextUrl.clone();
      target.pathname = "/sign-in";
      target.search = "?reason=idle";
      const response = withCookies(NextResponse.redirect(target), supabaseResponse);
      response.cookies.delete(LAST_ACTIVE_COOKIE);
      return response;
    }
  }

  if (!signedIn && !isPublic(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/sign-in";
    target.search = pathname === "/clients" || pathname === "/start" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return withCookies(NextResponse.redirect(target), supabaseResponse);
  }

  if (signedIn && pathname.startsWith("/sign-in")) {
    const target = request.nextUrl.clone();
    // /start sends a consultancy to its clients and an organisation's own team to its cases.
    target.pathname = "/start";
    target.search = "";
    return withCookies(NextResponse.redirect(target), supabaseResponse);
  }

  if (signedIn) touch(supabaseResponse, now);
  else if (request.cookies.has(LAST_ACTIVE_COOKIE)) supabaseResponse.cookies.delete(LAST_ACTIVE_COOKIE);
  return supabaseResponse;
}

/** Record activity: an HTTP-only cookie the browser cannot read or forge usefully. */
function touch(response: NextResponse, now: number) {
  response.cookies.set(LAST_ACTIVE_COOKIE, String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
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
