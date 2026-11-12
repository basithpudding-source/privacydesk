"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { cleanViewParams, MAX_SAVED_VIEWS, type ViewParams } from "@/lib/cases/views";
import { createClient } from "@/lib/supabase/server";

export interface ViewResult {
  error: string | null;
}

function describe(code: string | undefined): string {
  if (code === "23505") return "You already have a view with that name. Choose another, or update that one.";
  // 42P01 / PGRST205: the table is not there yet.
  if (code === "42P01" || code === "PGRST205") return "The database needs migration 0019 before views can be saved.";
  return "The view could not be saved. Try again in a minute.";
}

function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 60 ? name : null;
}

/** Save the current filters, sort and columns under a name. Views belong to the person who saves them. */
export async function saveView(rawName: string, params: ViewParams): Promise<ViewResult> {
  await requireMember();
  const name = cleanName(rawName);
  if (!name) return { error: "Give the view a name of 1 to 60 characters." };
  const supabase = await createClient();
  const { count } = await supabase.from("saved_views").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_SAVED_VIEWS) return { error: `You can keep ${MAX_SAVED_VIEWS} saved views. Delete one first.` };
  const { error } = await supabase.from("saved_views").insert({ name, params: cleanViewParams(params) });
  if (error) return { error: describe(error.code) };
  revalidatePath("/cases");
  return { error: null };
}

/** Rename a saved view, replace what it remembers with the current filters and columns, or both. */
export async function updateView(id: string, change: { name?: string; params?: ViewParams }): Promise<ViewResult> {
  await requireMember();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change.name !== undefined) {
    const name = cleanName(change.name);
    if (!name) return { error: "Give the view a name of 1 to 60 characters." };
    patch.name = name;
  }
  if (change.params !== undefined) patch.params = cleanViewParams(change.params);
  const supabase = await createClient();
  // Row-level security limits this to the person's own views.
  const { error } = await supabase.from("saved_views").update(patch).eq("id", id);
  if (error) return { error: describe(error.code) };
  revalidatePath("/cases");
  return { error: null };
}

export async function deleteView(id: string): Promise<ViewResult> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.from("saved_views").delete().eq("id", id);
  if (error) return { error: describe(error.code) };
  revalidatePath("/cases");
  return { error: null };
}
