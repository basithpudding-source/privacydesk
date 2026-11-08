// Supabase client for Server Components, Server Actions and Route Handlers.
// The session lives in cookies; this client reads them and, where it can, refreshes them.
// Server Components cannot write cookies, so setAll swallows that error: the
// session-refresh middleware added in slice 2 keeps cookies current instead.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

export async function createClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only here.
        }
      },
    },
  });
}
