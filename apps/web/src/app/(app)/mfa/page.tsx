import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
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
    <div className="w-full">
      <PageHeader title="Enter your code" description="Open your authenticator app and enter the code it shows for Privacy Desk." />
      <div className="surface mt-6 w-full max-w-md p-6">
        <VerifyTotp factorId={factor.id} nextHref="/clients" />
      </div>
      <form action="/auth/sign-out" method="post" className="mt-8">
        <Button type="submit" variant="link" className="px-0 text-muted-foreground">
          Lost your phone? Sign out and contact your administrator.
        </Button>
      </form>
    </div>
  );
}
