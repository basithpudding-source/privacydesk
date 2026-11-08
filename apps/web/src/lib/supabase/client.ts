// Supabase client for Client Components (runs in the browser).
// Uses the publishable key only; every query is subject to row-level security.
import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

export function createClient() {
  const { url, key } = supabaseEnv();
  // The app's tables live in the pd schema, so .from("cases") means pd.cases.
  return createBrowserClient(url, key, { db: { schema: "pd" } });
}
