// Reads the two public Supabase settings and fails loudly when they are missing,
// so a misconfigured deployment stops at startup instead of returning empty data.

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy apps/web/.env.local.example to .env.local and fill in both values.",
    );
  }
  return { url, key };
}
