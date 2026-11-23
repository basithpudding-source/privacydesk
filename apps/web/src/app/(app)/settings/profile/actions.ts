"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface NameState {
  error: string | null;
  saved: boolean;
}

/**
 * Save the name and job title the person wants used for themselves: shown at the top of the
 * app and used to sign letter drafts. They are kept in the person's own sign-in record (not in
 * the case data); the session is refreshed so they apply at once. The name is also copied to
 * the desk's directory, so colleagues see it beside what the person did.
 */
export async function saveDisplayName(_prev: NameState, formData: FormData): Promise<NameState> {
  await requireUser();
  const name = String(formData.get("display_name") ?? "").replace(/\s+/g, " ").trim();
  const title = String(formData.get("job_title") ?? "").replace(/\s+/g, " ").trim();
  if (name.length > 80) return { error: "Keep the name to 80 characters or fewer.", saved: false };
  if (title.length > 80) return { error: "Keep the job title to 80 characters or fewer.", saved: false };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { display_name: name || null, job_title: title || null } });
  if (error) return { error: "Your details could not be saved. Try again in a minute.", saved: false };
  await supabase.auth.refreshSession();
  // The desk's directory names people on the audit trails; it takes the name from the
  // sign-in record just saved. Before migration 0023 the function is not there, which is fine.
  await supabase.rpc("sync_my_name");
  revalidatePath("/", "layout");
  return { error: null, saved: true };
}
