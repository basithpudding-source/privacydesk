"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createPartner(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 120) redirect("/welcome?error=name");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_partner", { p_name: name });

  if (error) {
    // 23505 is unique_violation: the user already belongs to a consultancy.
    if (error.code === "23505") redirect("/clients");
    redirect(`/welcome?error=create&detail=${encodeURIComponent(error.message)}`);
  }
  redirect("/clients");
}
