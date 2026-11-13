"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cleanEmail, isRole, teamError } from "@/lib/team";

export interface TeamResult {
  error: string | null;
  /** The address just added, so the page can say what to tell that person. */
  added?: string;
}

// Each of these asks the database to make the change (migration 0022). The database decides
// whether the person may make it, and writes it to the team log; nothing here is trusted.

/** Add a colleague by the address they will sign in with, at a level of access. */
export async function addPerson(_prev: TeamResult, formData: FormData): Promise<TeamResult> {
  await requireAdmin();
  const email = cleanEmail(String(formData.get("email") ?? ""));
  const role = formData.get("role");
  if (!email) return { error: "Enter the email address they will sign in with." };
  if (!isRole(role)) return { error: "Choose a level of access." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_member", { p_email: email, p_role: role });
  if (error) return { error: teamError(error) };
  revalidatePath("/settings/team");
  return { error: null, added: email };
}

export async function withdrawInvitation(id: string): Promise<TeamResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invitation", { p_id: id });
  if (error) return { error: teamError(error) };
  revalidatePath("/settings/team");
  return { error: null };
}

export async function changeAccess(memberId: string, role: string): Promise<TeamResult> {
  await requireAdmin();
  if (!isRole(role)) return { error: "Choose a level of access." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", { p_member: memberId, p_role: role });
  if (error) return { error: teamError(error) };
  revalidatePath("/settings/team");
  return { error: null };
}

export async function removePerson(memberId: string): Promise<TeamResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_member: memberId });
  if (error) return { error: teamError(error) };
  revalidatePath("/settings/team");
  return { error: null };
}
