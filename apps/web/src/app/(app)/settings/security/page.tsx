import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SettingsNav } from "@/components/settings-nav";
import { requireUser, seesWholeDesk } from "@/lib/auth";
import { deskWords } from "@/lib/desk";
import { longDate } from "@/lib/clocks";
import { createClient } from "@/lib/supabase/server";
import { EnrolTotp } from "./enrol-totp";
import { FactorList, type FactorSummary } from "./factor-list";
import { londonDate } from "@/lib/today";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factors: FactorSummary[] = (data?.totp ?? [])
    .filter((f) => f.status === "verified")
    .map((f) => ({ id: f.id, name: f.friendly_name ?? "Authenticator app", since: longDate(londonDate(f.created_at)) }));

  const isAdmin = user.membership?.role === "partner_admin";
  // Anyone who can see the whole desk needs one, whatever their level of access.
  const mustEnrol = Boolean(user.membership && seesWholeDesk(user.membership)) && factors.length === 0;
  const words = deskWords(user.membership?.kind ?? "consultancy");

  return (
    <div className="w-full">
      <PageHeader title="Security" description={<>Signed in as {user.email}.</>} />
      {/* Not shown while the second factor is still to be set up: nothing else opens until it is. */}
      {!mustEnrol && user.assurance === "aal2" && <SettingsNav current="security" isAdmin={isAdmin} />}

      <section className="surface mt-6 max-w-[43rem] p-6">
        <h2 className="font-semibold">Second factor</h2>
        {mustEnrol ? (
          <Alert className="mt-3">
            <AlertTitle>Everyone on the team must use a second factor</AlertTitle>
            <AlertDescription>
              Set up an authenticator app before using the desk. It protects {words.whoseData} if your email is ever compromised.
            </AlertDescription>
          </Alert>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            A code from your phone, asked for each time you sign in.
          </p>
        )}

        <div className="mt-4">
          {factors.length > 0 ? (
            <FactorList factors={factors} canRemove={user.assurance === "aal2"} />
          ) : (
            <EnrolTotp nextHref="/start" />
          )}
        </div>
        {factors.length > 0 && user.assurance !== "aal2" && (
          <p className="mt-3 text-sm text-muted-foreground">
            To remove an authenticator, <a href="/mfa" className="underline underline-offset-4">enter a code first</a>.
          </p>
        )}
      </section>
    </div>
  );
}
