import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import type { MemberRole } from "@/lib/db/types";
import { deskKindOf } from "@/lib/desk";
import { createClient } from "@/lib/supabase/server";
import { isRole, ROLE_LABELS, roleAllows } from "@/lib/team";
import { joinDesk } from "./actions";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Welcome" };

interface Pending {
  id: string;
  desk: string;
  kind: string;
  role: MemberRole;
}

/**
 * Where someone lands who has signed in but is not in a desk yet. If an administrator has
 * added their address to a team, they are asked to join it; otherwise they set up a desk of
 * their own, for a consultancy or for their own organisation.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  if (user.membership) redirect("/start");
  const { error } = await searchParams;

  const supabase = await createClient();
  // Matched in the database on the address this person has proved is theirs. Before
  // migration 0022 the function is not there, which reads as "nothing waiting".
  const { data } = await supabase.rpc("pending_invitations");
  const pending = ((data ?? []) as Pending[]).filter((p) => isRole(p.role));

  return (
    <main className="flex flex-1 flex-col justify-center bg-canvas px-4 py-16 sm:px-8">
      <div className="surface mx-auto w-full max-w-md p-6 sm:p-8">
        <Brand />

        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>{error === "gone" ? "That invitation has been withdrawn" : "You could not be added to the desk"}</AlertTitle>
            <AlertDescription>{error === "gone" ? "Ask whoever added you to add you again." : "Try again in a minute, or ask whoever added you."}</AlertDescription>
          </Alert>
        )}

        {pending.length > 0 ? (
          <>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">You have been added to a team</h1>
            <p className="mt-3 text-muted-foreground">
              You are signed in as <span className="font-medium text-foreground">{user.email}</span>.
            </p>
            <ul className="mt-6 flex flex-col gap-4">
              {pending.map((p) => (
                <li key={p.id} className="rounded-lg border border-border p-4">
                  <p className="font-medium">{p.desk}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your access: <span className="font-medium text-foreground">{ROLE_LABELS[p.role]}</span>. {roleAllows(p.role, deskKindOf(p.kind))}
                  </p>
                  <form action={joinDesk} className="mt-3">
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit">Join {p.desk}</Button>
                  </form>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-muted-foreground">Next you will set up an authenticator app, which is asked of everyone before they can see a case.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Set up your desk</h1>
            <p className="mt-3 text-muted-foreground">
              You are signed in as <span className="font-medium text-foreground">{user.email}</span>. You will be the desk&apos;s administrator and can add colleagues afterwards.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">Expecting to join a team that already uses Privacy Desk? Ask its administrator to add this email address, then reload this page.</p>
            <SetupForm />
          </>
        )}

        <form action="/auth/sign-out" method="post" className="mt-8">
          <Button type="submit" variant="link" className="px-0">
            Not you? Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
