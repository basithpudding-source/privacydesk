import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { People, Person } from "./people";

/**
 * Everyone who is, or has been, in the signed-in person's desk, by sign-in id. Row-level
 * security returns their own desk's directory and nobody else's. Before migration 0023 the
 * table is not there, which reads as an empty directory: logs then fall back to a short id.
 */
export async function peopleOfDesk(): Promise<People> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").select("user_id, name, email, left_at");
  const people = new Map<string, Person>();
  if (error) return people;
  for (const r of data ?? []) {
    people.set(r.user_id as string, { name: (r.name as string | null) ?? null, email: (r.email as string | null) ?? null, left: Boolean(r.left_at) });
  }
  return people;
}
