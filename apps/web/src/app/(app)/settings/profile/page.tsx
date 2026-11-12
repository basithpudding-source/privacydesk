import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { displayName, jobTitle, requireUser } from "@/lib/auth";
import { longDate } from "@/lib/clocks";
import { getPrefs } from "@/lib/prefs-server";
import { createClient } from "@/lib/supabase/server";
import { londonDate } from "@/lib/today";
import { NameForm, PreferencesForm } from "./profile-forms";

export const metadata: Metadata = { title: "Your profile" };

const ROLES: Record<string, { label: string; can: string }> = {
  partner_admin: { label: "Administrator", can: "You can see and change every client's cases, add clients and manage the consultancy." },
  client_user: { label: "Case handler", can: "You can see and change the cases of the clients you have been given." },
  read_only: { label: "Read only", can: "You can read cases and the inbox but not change them." },
};

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  // The sign-in record itself, for the dates and the name as saved (the session copy can lag).
  const [{ data: auth }, prefs, clientRow] = await Promise.all([
    supabase.auth.getUser(),
    getPrefs(),
    user.membership?.organisationId ? supabase.from("organisations").select("name").eq("id", user.membership.organisationId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const name = displayName(auth.user?.user_metadata) ?? user.name ?? "";
  const title = jobTitle(auth.user?.user_metadata) ?? user.jobTitle ?? "";
  const role = ROLES[user.membership?.role ?? ""] ?? { label: "No role yet", can: "You have not joined a consultancy." };
  const day = (iso: string | undefined | null) => (iso ? longDate(londonDate(iso)) : "Not known");
  const time = (iso: string | undefined | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }) : "");

  return (
    <div className="w-full">
      <PageHeader title="Your profile" description="Who you are signed in as, what you can do here, and how you like the app to look." />

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="you-heading" className="surface p-6">
            <h2 id="you-heading" className="font-semibold">Signed in as</h2>
            <p className="mt-2 text-lg font-medium">{name || user.email}</p>
            {(name || title) && <p className="text-sm text-muted-foreground">{[title, name ? user.email : null].filter(Boolean).join(" · ")}</p>}
            <div className="mt-5">
              <NameForm initial={name} initialTitle={title} />
            </div>
            <dl className="mt-6 grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-border pt-5 text-sm">
              <dt className="text-muted-foreground">Email</dt>
              <dd>
                {user.email}
                <span className="block text-xs text-muted-foreground">You sign in with a link sent to this address. To change it, ask your administrator.</span>
              </dd>
              <dt className="text-muted-foreground">Consultancy</dt>
              <dd>{user.membership?.partnerName ?? "None yet"}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd>
                <Tag tone="info">{role.label}</Tag>
                <span className="mt-1 block text-xs text-muted-foreground">{role.can}</span>
              </dd>
              <dt className="text-muted-foreground">Clients</dt>
              <dd>{user.membership ? (user.membership.organisationId ? (clientRow?.data?.name ?? "One client") : "All clients of the consultancy") : "None"}</dd>
              <dt className="text-muted-foreground">Account created</dt>
              <dd>{day(auth.user?.created_at)}</dd>
              <dt className="text-muted-foreground">Last signed in</dt>
              <dd>
                {day(auth.user?.last_sign_in_at)}
                {auth.user?.last_sign_in_at && <span className="text-muted-foreground"> at {time(auth.user.last_sign_in_at)}</span>}
              </dd>
            </dl>
          </section>

          <section aria-labelledby="security-heading" className="surface p-6">
            <h2 id="security-heading" className="font-semibold">Security and session</h2>
            <dl className="mt-4 grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Second factor</dt>
              <dd>
                {user.enrolled ? <Tag tone="ok">Set up</Tag> : <Tag tone="warn">Not set up</Tag>}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {user.enrolled ? "A code from your authenticator app is asked for when you sign in." : "An authenticator app protects every client's data if your email is ever compromised."}
                </span>
              </dd>
              <dt className="text-muted-foreground">This session</dt>
              <dd>
                {user.assurance === "aal2" ? <Tag tone="ok">Code entered</Tag> : <Tag>Email link only</Tag>}
                <span className="mt-1 block text-xs text-muted-foreground">You are signed out automatically after a period without activity.</span>
              </dd>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" size="lg" render={<Link href="/settings/security" />} nativeButton={false}>
                <ShieldCheck data-icon="inline-start" aria-hidden="true" />
                Manage second factor
              </Button>
              <form action="/auth/sign-out" method="post">
                <Button type="submit" variant="outline" size="lg">
                  <LogOut data-icon="inline-start" aria-hidden="true" />
                  Sign out
                </Button>
              </form>
            </div>
          </section>
        </div>

        <section aria-labelledby="look-heading" className="surface min-w-0 p-6">
          <h2 id="look-heading" className="font-semibold">Look and layout</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">Each choice applies as soon as you pick it. Columns and saved filters for the case list are set on the Cases page.</p>
          <PreferencesForm initial={prefs} />
        </section>
      </div>
    </div>
  );
}
