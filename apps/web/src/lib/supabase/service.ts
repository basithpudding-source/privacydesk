// The service role: sees every consultancy and bypasses row-level security. Used by one
// route only, /api/jobs/nightly, because reminders have to cover every consultancy's cases
// and read members' email addresses. Never import this from a page, a server action or
// anything the browser can reach. The key comes from SUPABASE_SERVICE_ROLE_KEY (no
// NEXT_PUBLIC_ prefix) and is missing from .env.local until the nightly job is set up.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

export function serviceConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set, so the nightly job cannot run.");
  const { url } = supabaseEnv();
  return createClient(url, key, { db: { schema: "pd" }, auth: { persistSession: false, autoRefreshToken: false } });
}
