import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// POST only, so a stray link or prefetch cannot sign someone out.
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
