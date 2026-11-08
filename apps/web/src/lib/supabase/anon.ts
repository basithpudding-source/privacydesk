// A Supabase client with no user session: the anonymous role. Used by the inbound webhook and
// the public form, which reach the database only through definer-rights functions keyed by a
// token or a client code. It has no table grants, so it can read nothing directly.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

export function createAnonClient() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { db: { schema: "pd" }, auth: { persistSession: false } });
}
