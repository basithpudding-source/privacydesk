import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, StickyNote, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { UndoForm } from "@/components/undo-form";
import { inboxItemForCase } from "@/lib/inbox/queries";
import { returnCaseToInbox } from "../../inbox/actions";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { requireMember } from "@/lib/auth";
import { clockFor, engineDue } from "@/lib/cases/clock";
import { typeLabel } from "@/lib/cases/labels";
import { getCase } from "@/lib/cases/queries";
import { ACTIONS, type CaseAction } from "@/lib/cases/types";
import { longDate } from "@/lib/clocks";
import { REGIONS } from "@/lib/db/types";
import { aiConfigured } from "@/lib/ai/client";
import { ActionPanel } from "./action-panel";
import { AuditTrail } from "./audit-trail";
import { CaseFacts } from "./case-facts";
import { DeadlineBlock } from "./deadline-block";
import { RequestText } from "./request-text";
import { LetterDrafts, type LetterEmail } from "./letter-drafts";
import { buildTasks, nextStep, TaskList } from "./task-list";
import { emailSubject, type KnownDate, type LetterKind } from "@/lib/letters/email";
import { londonDate, todayInLondon } from "@/lib/today";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Case" };

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ do?: string }>;
}) {
  const user = await requireMember();
  const { id } = await params;
  const { do: doParam } = await searchParams;
  const [detail, fromInbox] = await Promise.all([getCase(id), inboxItemForCase(id)]);
  if (!detail) notFound();
  const { c, org, deadline, pauses, events, holidays, holidayCount } = detail;

  const clock = clockFor(c, pauses, holidays);
  const returned = Boolean(c.returned_to_inbox);
  // A returned case is a closed record: nothing more can be done to it.
  const canWrite = user.membership.role !== "read_only" && !returned;
  const action = canWrite && ACTIONS.includes(doParam as CaseAction) ? (doParam as CaseAction) : null;
  // Only a case that came from an inbox message, and is still open, can go back there.
  const canReturn = canWrite && Boolean(fromInbox) && c.status === "open";
  const returning = canReturn && doParam === "return";
  const today = todayInLondon();
  const closed = c.status === "closed";
  const isComplaint = c.type === "complaint";
  const tasks = buildTasks(c, pauses);
  const next = canWrite ? nextStep(tasks, isComplaint) : null;

  // What the letters box needs to turn a draft into a reply: who it goes to, a subject for
  // each kind of letter, the person's own message to quote underneath, and this case's dates
  // and references to check a draft against.
  const kinds: LetterKind[] = ["ack", "id", "clarify", "extend", "outcome"];
  const dated: [string | null | undefined, string][] = [
    [c.received_on, "received"],
    [isComplaint ? deadline.ack_due : deadline.response_due, "legal deadline"],
    [deadline.internal_target, "internal target"],
    [c.acknowledged_on, "acknowledged"],
    [c.id_received_on, "proof of identity received"],
    [c.extended_on, "extension told"],
    [clock.kind !== "complaint" ? clock.extensionNoticeBy : null, "last day to tell them of an extension"],
    ...pauses.flatMap((p): [string | null, string][] => [[p.paused_on, "clarification asked"], [p.resumed_on, "clarification received"]]),
    [c.closed_on, "closed"],
    [today, "today"],
  ];
  const knownDates: KnownDate[] = [];
  for (const [date, label] of dated) if (date && !knownDates.some((k) => k.date === date)) knownDates.push({ date, label });
  const recordStep: Record<LetterKind, { action: CaseAction; label: string }> = {
    ack: { action: "acknowledge", label: "Mark acknowledged" },
    id: { action: "ask_id", label: "Record the ID request" },
    clarify: { action: "pause", label: "Record the clarification request" },
    extend: { action: "extend", label: "Record the extension" },
    outcome: { action: "close", label: isComplaint ? "Close with the outcome" : "Close: response sent" },
  };
  const letterEmail: LetterEmail = {
    to: c.requester_email ?? "",
    subjects: Object.fromEntries(
      kinds.map((k) => [k, emailSubject({ kind: k, typeLabel: typeLabel(c.type), ref: c.ref, originalSubject: fromInbox?.subject, isComplaint })]),
    ) as Record<LetterKind, string>,
    original: c.message
      ? {
          fromName: fromInbox?.from_name ?? c.requester_name,
          fromEmail: fromInbox?.from_email ?? c.requester_email,
          sentOn: fromInbox ? londonDate(fromInbox.received_at) : c.received_on,
          subject: fromInbox?.subject ?? null,
          body: c.message,
        }
      : null,
    // Their own words are worth quoting when they wrote in; notes of a phone call are not.
    quoteByDefault: c.channel === "Email" || c.channel === "Web form",
    knownDates,
    refs: [c.ref, c.source_ref].filter((r): r is string => Boolean(r)),
    requesterName: c.requester_name,
    signerComplete: Boolean(user.name && user.jobTitle),
    // Offer to record a step only when the case can take it now.
    record: Object.fromEntries(
      kinds.filter((k) => tasks.some((t) => t.action === recordStep[k].action)).map((k) => [k, { href: `/cases/${c.id}?do=${recordStep[k].action}`, label: recordStep[k].label }]),
    ),
  };

  // The second row of the top pane, closed until asked for. The details run in two columns
  // once their half of the pane is wide enough, or sooner when there is no message beside them.
  const fact = "grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3";
  const details = (
    <dl className={cn("mt-3 grid gap-x-8 gap-y-2.5 text-sm @6xl:grid-cols-2", !c.message && "@2xl:grid-cols-2")}>
      <div className={fact}>
        <dt className="text-muted-foreground">Client</dt>
        <dd>
          <Link href={`/clients/${org.id}`} className="underline-offset-4 hover:underline">
            {org.name}
          </Link>
        </dd>
      </div>
      <div className={fact}>
        <dt className="text-muted-foreground">From</dt>
        <dd className="min-w-0">
          {c.requester_name ?? <span className="text-muted-foreground">Unknown</span>}
          {c.requester_email && <span className="block truncate text-muted-foreground" title={c.requester_email}>{c.requester_email}</span>}
        </dd>
      </div>
      <div className={fact}>
        <dt className="text-muted-foreground">Received</dt>
        <dd>
          {longDate(c.received_on)}
          <span className="block text-muted-foreground">by {c.channel.toLowerCase()}</span>
        </dd>
      </div>
      {c.source_ref && (
        <div className={fact}>
          <dt className="text-muted-foreground">Their ref</dt>
          <dd className="font-mono text-xs leading-5">{c.source_ref}</dd>
        </div>
      )}
      {c.summary && (
        <div className={fact}>
          <dt className="text-muted-foreground">Summary</dt>
          <dd>{c.summary}</dd>
        </div>
      )}
    </dl>
  );

  return (
    <div className="w-full">
      <PageHeader
        back={{ href: "/cases", label: "Cases" }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <span className="font-mono">{c.ref}</span> <span className="font-normal text-muted-foreground">·</span> {typeLabel(c.type)}
            </span>
            <Tag tone={closed ? "neutral" : "info"}>{returned ? "Returned to the inbox" : closed ? "Closed" : "Open"}</Tag>
          </span>
        }
        actions={
          canWrite && (
            <>
              {canReturn && (
                <Button variant="outline" size="lg" render={<Link href={`/cases/${c.id}?do=return`} scroll={false} />} nativeButton={false} title="Close this case and put its message back in the inbox, to be triaged and accepted again">
                  <Undo2 data-icon="inline-start" aria-hidden="true" />
                  Return to the inbox
                </Button>
              )}
              <Button variant="outline" size="lg" render={<Link href={`/cases/${c.id}?do=note`} scroll={false} />} nativeButton={false}>
                <StickyNote data-icon="inline-start" aria-hidden="true" />
                Add a note
              </Button>
              {next && (
                <Button size="lg" render={<Link href={`/cases/${c.id}?do=${next.action}`} scroll={false} />} nativeButton={false}>
                  {next.label}
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Button>
              )}
            </>
          )
        }
      >
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2 text-foreground">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: org.colour }} aria-hidden="true" />
            {org.name}
          </span>
          {c.requester_name && <span>· from {c.requester_name}</span>}
        </p>
      </PageHeader>

      {returned && (
        <p className="surface mt-6 flex items-start gap-2.5 px-5 py-4 text-sm">
          <Undo2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            This case was returned to the inbox, so its message could be triaged and accepted again. It is closed and kept for the record, cannot be changed or reopened, and is not counted in the on-time figures.{" "}
            <Link href="/inbox" className="underline underline-offset-4">Go to the inbox</Link>
          </span>
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <DeadlineBlock
            clock={clock}
            deadline={deadline}
            engineDue={engineDue(clock)}
            internalTarget={deadline.internal_target}
            internalTargetDays={org.internal_target_days}
            regionLabel={REGIONS.find((r) => r.value === org.region)?.label ?? org.region}
            holidayCount={holidayCount}
            returned={returned}
            facts={<CaseFacts details={details} request={c.message ? <RequestText text={c.message} /> : null} />}
          />

          <div className="grid gap-6 2xl:grid-cols-2 2xl:items-start">
          <section aria-labelledby="steps-heading" className="min-w-0">
            <h2 id="steps-heading" className="section-label mb-2">
              Steps
            </h2>
            <TaskList tasks={tasks} canWrite={canWrite} caseId={c.id} active={action} />
            {user.membership.role === "read_only" && <p className="mt-2 text-xs text-muted-foreground">You can read this case but not change it.</p>}
          </section>

          {canWrite && (
            <section aria-labelledby="letters-heading" className="min-w-0">
              <h2 id="letters-heading" className="section-label mb-2">
                Letters
              </h2>
              <div className="surface p-5">
                <LetterDrafts caseId={c.id} isComplaint={isComplaint} aiOn={aiConfigured() && org.ai_enabled} email={letterEmail} />
              </div>
            </section>
          )}
          </div>
        </div>

        {/* Beside the page: recording a step or a note, and the audit trail. Nothing else. */}
        <div className="flex min-w-0 flex-col gap-6">
          {returning && (
            <div className="surface border-ring/50 p-5 ring-3 ring-ring/15 lg:sticky lg:top-20 lg:z-10">
              <UndoForm
                action={returnCaseToInbox.bind(null, c.id)}
                title="Return this case to the inbox"
                explain={`Use this if the message was accepted with the wrong details. Case ${c.ref} is closed and kept for the record (it is never deleted, and its reference is not reused). The message returns to the inbox to be triaged and accepted again as a new case.`}
                button="Close the case and put the message back"
                placeholder="For example: accepted as a SAR; it is a complaint"
              />
              <Link href={`/cases/${c.id}`} scroll={false} className="mt-3 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
                Cancel
              </Link>
            </div>
          )}
          {action && !returning && (
            <div className="lg:sticky lg:top-20 lg:z-10">
              <ActionPanel key={action} caseId={c.id} action={action} isComplaint={isComplaint} today={today} requesterEmail={c.requester_email} receivedOn={c.received_on} />
            </div>
          )}

          <section aria-labelledby="audit-heading" className="surface p-5">
            <h2 id="audit-heading" className="section-label mb-3">
              Audit trail
            </h2>
            <AuditTrail events={events} currentUserId={user.id} />
          </section>
        </div>
      </div>
    </div>
  );
}
