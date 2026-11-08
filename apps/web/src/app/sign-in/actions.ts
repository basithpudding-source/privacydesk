"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendSignInLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) redirect("/sign-in?error=email");

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // The confirm route handles both the token-hash template and the default one.
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) redirect(`/sign-in?error=send&detail=${encodeURIComponent(error.message)}`);
  redirect(`/sign-in?sent=${encodeURIComponent(email)}`);
}
