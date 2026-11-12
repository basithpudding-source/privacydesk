"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface NameState {
  error: string | null;
  saved: boolean;
}

/**
 * Save the name the person wants shown for themselves. It is kept in their own sign-in
 * record (not in the case data), so it needs no database change; the session is refreshed
 * so the new name shows at once.
 */
export async function saveDisplayName(_prev: NameState, formData: FormData): Promise<NameState> {
  await requireUser();
  const name = String(formData.get("display_name") ?? "").trim();
  if (name.length > 80) return { error: "Keep the name to 80 characters or fewer.", saved: false };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { display_name: name || null } });
  if (error) return { error: "The name could not be saved. Try again in a minute.", saved: false };
  await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
  return { error: null, saved: true };
}
