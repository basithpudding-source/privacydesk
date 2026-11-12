import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, StickyNote } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
import { DeadlineBlock } from "./deadline-block";
import { LetterDrafts } from "./letter-drafts";
import { buildTasks, nextStep, TaskList } from "./task-list";
import { todayInLondon } from "@/lib/today";

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
  const detail = await getCase(id);
  if (!detail) notFound();
  const { c, org, deadline, pauses, events, holidays, holidayCount } = detail;

  const clock = clockFor(c, pauses, holidays);
  const canWrite = user.membership.role !== "read_only";
  const action = canWrite && ACTIONS.includes(doParam as CaseAction) ? (doParam as CaseAction) : null;
  const today = todayInLondon();
  const closed = c.status === "closed";
  const isComplaint = c.type === "complaint";
  const tasks = buildTasks(c, pauses);
  const next = canWrite ? nextStep(tasks, isComplaint) : null;

  return (
    <div className="w-full">
      <PageHeader
        back={{ href: "/cases", label: "Cases" }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <span className="font-mono">{c.ref}</span> <span className="font-normal text-muted-foreground">·</span> {typeLabel(c.type)}
            </span>
            <Tag tone={closed ? "neutral" : "info"}>{closed ? "Closed" : "Open"}</Tag>
          </span>
        }
        actions={
          canWrite && (
            <>
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
          />

          <div className="grid gap-6 2xl:grid-cols-2 2xl:items-start">
          <section aria-labelledby="steps-heading" className="min-w-0">
            <h2 id="steps-heading" className="section-label mb-2">
              Steps
            </h2>
            <TaskList tasks={tasks} canWrite={canWrite} caseId={c.id} active={action} />
            {!canWrite && <p className="mt-2 text-xs text-muted-foreground">You can read this case but not change it.</p>}
          </section>

          <div className="flex min-w-0 flex-col gap-6">
          {canWrite && (
            <section aria-labelledby="letters-heading">
              <h2 id="letters-heading" className="section-label mb-2">
                Letters
              </h2>
              <div className="surface p-5">
                <LetterDrafts caseId={c.id} isComplaint={isComplaint} aiOn={aiConfigured() && org.ai_enabled} />
              </div>
            </section>
          )}

          {c.message && (
            <details className="surface group">
              <summary className="cursor-pointer rounded-xl px-5 py-3.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">The request as received</summary>
              <p className="max-w-[65ch] whitespace-pre-wrap border-t border-border px-5 py-4 text-sm">{c.message}</p>
            </details>
          )}
          </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {action && (
            <div className="lg:sticky lg:top-20 lg:z-10">
              <ActionPanel key={action} caseId={c.id} action={action} isComplaint={isComplaint} today={today} />
            </div>
          )}

          <section aria-labelledby="details-heading" className="surface p-5">
            <h2 id="details-heading" className="section-label">
              Details
            </h2>
            <dl className="mt-3 grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Client</dt>
              <dd>
                <Link href={`/clients/${org.id}`} className="underline-offset-4 hover:underline">
                  {org.name}
                </Link>
              </dd>
              <dt className="text-muted-foreground">From</dt>
              <dd className="min-w-0">
                {c.requester_name ?? <span className="text-muted-foreground">Unknown</span>}
                {c.requester_email && <span className="block truncate text-muted-foreground" title={c.requester_email}>{c.requester_email}</span>}
              </dd>
              <dt className="text-muted-foreground">Received</dt>
              <dd>
                {longDate(c.received_on)}
                <span className="block text-muted-foreground">by {c.channel.toLowerCase()}</span>
              </dd>
              {c.source_ref && (
                <>
                  <dt className="text-muted-foreground">Their ref</dt>
                  <dd className="font-mono text-xs leading-5">{c.source_ref}</dd>
                </>
              )}
              {c.summary && (
                <>
                  <dt className="text-muted-foreground">Summary</dt>
                  <dd>{c.summary}</dd>
                </>
              )}
            </dl>
          </section>

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
