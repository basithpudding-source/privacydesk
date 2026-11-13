import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tag } from "@/components/ui/tag";
import { requireAdmin } from "@/lib/auth";
import { shortDate } from "@/lib/clocks";
import { createClient } from "@/lib/supabase/server";
import { memberActions, ROLE_LABELS, ROLES, roleAllows, sortMembers, type Invitation, type TeamEvent, type TeamMember } from "@/lib/team";
import { londonDate } from "@/lib/today";
import { AddPersonForm, MemberControls, WithdrawButton } from "./team-forms";

export const metadata: Metadata = { title: "Team and access" };

const th = "border-b border-border px-4 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "border-b border-border px-4 py-3 align-top";

export default async function TeamPage() {
  const user = await requireAdmin();
  const supabase = await createClient();
  // Row-level security shows an administrator their own desk's team and nobody else's.
  const [members, invitations, events] = await Promise.all([
    supabase.from("members").select("*").eq("partner_id", user.membership.partnerId),
    supabase.from("invitations").select("id, email, role, created_at").order("created_at"),
    supabase.from("team_events").select("id, at, actor_email, text").order("id", { ascending: false }).limit(50),
  ]);
  // Before migration 0022 there is no invitations table, and members carry no address.
  const ready = !invitations.error;
  const team = sortMembers((members.data ?? []) as TeamMember[]);
  const waiting = (invitations.data ?? []) as Invitation[];
  const log = (events.data ?? []) as TeamEvent[];
  const kind = user.membership.kind;
  const signInUrl = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/sign-in`;
  const day = (iso: string) => shortDate(londonDate(iso));
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="w-full">
      <PageHeader title="Team and access" description={<>Who can sign in to {user.membership.partnerName}&apos;s desk, and what each person can do.</>} />
      <SettingsNav current="team" isAdmin />

      {!ready && (
        <Alert className="mt-6 max-w-[43rem]">
          <AlertTitle>The database needs migration 0022</AlertTitle>
          <AlertDescription>Adding people and changing access start working once it has been run. Until then you are the only person in this desk.</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="people-heading" className="surface overflow-x-auto">
            <h2 id="people-heading" className="px-4 pb-1 pt-4 font-semibold">
              People <span className="ml-1 text-sm font-normal tabular-nums text-muted-foreground">{team.length}</span>
            </h2>
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className={th}>Person</th>
                  <th scope="col" className={th}>Joined</th>
                  <th scope="col" className={`${th} text-right`}>Access</th>
                </tr>
              </thead>
              <tbody>
                {team.map((m) => {
                  const self = m.user_id === user.id;
                  const who = m.email ?? (self ? (user.email ?? "You") : "A member");
                  const can = memberActions(m, team, user.id);
                  return (
                    <tr key={m.id}>
                      <td className={td}>
                        <span className="break-all font-medium">{who}</span>
                        {self && <Tag className="ml-2">You</Tag>}
                        {m.organisation_id && <span className="block text-xs text-muted-foreground">One client only</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap tabular-nums text-muted-foreground`}>{day(m.created_at)}</td>
                      <td className={`${td} text-right`}>
                        {ready ? (
                          <MemberControls memberId={m.id} who={who} role={m.role} canChangeRole={can.canChangeRole} canRemove={can.canRemove} why={can.why} />
                        ) : (
                          <Tag tone="info">{ROLE_LABELS[m.role]}</Tag>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {waiting.length > 0 && (
            <section aria-labelledby="waiting-heading" className="surface overflow-x-auto">
              <h2 id="waiting-heading" className="px-4 pt-4 font-semibold">
                Added, not signed in yet <span className="ml-1 text-sm font-normal tabular-nums text-muted-foreground">{waiting.length}</span>
              </h2>
              <p className="px-4 pb-2 pt-0.5 text-sm text-muted-foreground">They join the first time they sign in with this address. No email is sent for them: give them the sign-in address yourself.</p>
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={th}>Email address</th>
                    <th scope="col" className={th}>Access</th>
                    <th scope="col" className={th}>Added</th>
                    <th scope="col" className={th}><span className="sr-only">Withdraw</span></th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((i) => (
                    <tr key={i.id}>
                      <td className={`${td} break-all font-medium`}>{i.email}</td>
                      <td className={td}>
                        <Tag tone="info">{ROLE_LABELS[i.role]}</Tag>
                      </td>
                      <td className={`${td} whitespace-nowrap tabular-nums text-muted-foreground`}>{day(i.created_at)}</td>
                      <td className={`${td} text-right`}>
                        <WithdrawButton invitationId={i.id} who={i.email} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section aria-labelledby="log-heading" className="surface p-5">
            <h2 id="log-heading" className="font-semibold">Changes to the team</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Kept automatically and cannot be edited: who was given access, by whom, and every change since.</p>
            {log.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{ready ? "Nothing yet." : "Starts with migration 0022."}</p>
            ) : (
              <ol className="mt-4 space-y-3 text-sm">
                {log.map((e) => (
                  <li key={e.id}>
                    <p>{e.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {day(e.at)} at {time(e.at)}
                      {e.actor_email ? ` · ${e.actor_email === user.email?.toLowerCase() ? "you" : e.actor_email}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {ready && (
            <section aria-labelledby="add-heading" className="surface p-5">
              <h2 id="add-heading" className="mb-4 font-semibold">Add a person</h2>
              <AddPersonForm kind={kind} signInUrl={signInUrl} />
            </section>
          )}

          <section aria-labelledby="levels-heading" className="surface p-5">
            <h2 id="levels-heading" className="font-semibold">What each level of access allows</h2>
            <dl className="mt-3 space-y-3 text-sm">
              {ROLES.map((r) => (
                <div key={r}>
                  <dt className="font-medium">{ROLE_LABELS[r]}</dt>
                  <dd className="text-muted-foreground">{roleAllows(r, kind)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
              Everyone must set up an authenticator app before they can see a case. Remove a person as soon as they leave or change job.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
