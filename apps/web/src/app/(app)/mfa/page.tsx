import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VerifyTotp } from "./verify-totp";

export const metadata: Metadata = { title: "Enter your code" };

export default async function MfaPage() {
  const user = await requireUser();
  if (user.assurance === "aal2") redirect("/clients");

  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = (data?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) redirect("/settings/security");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Enter your code</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Open your authenticator app and enter the code it shows for Privacy Desk.
      </p>
      <VerifyTotp factorId={factor.id} nextHref="/clients" />
      <form action="/auth/sign-out" method="post" className="mt-8">
        <Button type="submit" variant="link" className="px-0 text-muted-foreground">
          Lost your phone? Sign out and contact your administrator.
        </Button>
      </form>
    </div>
  );
}
