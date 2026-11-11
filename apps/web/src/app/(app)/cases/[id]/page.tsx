import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { clockFor, engineDue } from "@/lib/cases/clock";
import { typeLabel } from "@/lib/cases/labels";
import { getCase } from "@/lib/cases/queries";
import { ACTIONS, type CaseAction } from "@/lib/cases/types";
import { REGIONS } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { aiConfigured } from "@/lib/ai/client";
import { ActionPanel } from "./action-panel";
import { AuditTrail } from "./audit-trail";
import { DeadlineBlock } from "./deadline-block";
import { LetterDrafts } from "./letter-drafts";
import { TaskList } from "./task-list";
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

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link href="/cases" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Cases
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="font-mono">{c.ref}</span> · {typeLabel(c.type)}
        </h1>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", closed ? "bg-muted text-muted-foreground" : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200")}>
          {closed ? "Closed" : "Open"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: org.colour }} aria-hidden="true" />
          {org.name}
        </span>
        {c.requester_name && <> · from {c.requester_name}</>}
        {c.requester_email && <> ({c.requester_email})</>}
      </p>

      <div className={cn("mt-6 grid gap-6", action ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : "")}>
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

          {c.summary && (
            <section aria-labelledby="summary-heading">
              <h2 id="summary-heading" className="text-sm font-medium text-muted-foreground">
                Summary
              </h2>
              <p className="mt-1 max-w-[65ch]">{c.summary}</p>
            </section>
          )}

          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className="mb-2 text-sm font-medium text-muted-foreground">
              Steps
            </h2>
            <TaskList c={c} pauses={pauses} canWrite={canWrite} caseId={c.id} />
            {!canWrite && <p className="mt-2 text-xs text-muted-foreground">You can read this case but not change it.</p>}
          </section>

          {c.message && (
            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">The request as received</summary>
              <p className="max-w-[65ch] whitespace-pre-wrap px-4 pb-4 text-sm">{c.message}</p>
            </details>
          )}

          {canWrite && (
            <section aria-labelledby="letters-heading">
              <h2 id="letters-heading" className="mb-2 text-sm font-medium text-muted-foreground">
                Letters
              </h2>
              <LetterDrafts caseId={c.id} isComplaint={c.type === "complaint"} aiOn={aiConfigured() && org.ai_enabled} />
            </section>
          )}

          <section aria-labelledby="audit-heading">
            <h2 id="audit-heading" className="mb-2 text-sm font-medium text-muted-foreground">
              Audit trail
            </h2>
            <AuditTrail events={events} currentUserId={user.id} />
          </section>
        </div>

        {action && (
          <div className="lg:sticky lg:top-6 lg:self-start">
            <ActionPanel caseId={c.id} action={action} isComplaint={c.type === "complaint"} today={today} />
          </div>
        )}
      </div>
    </div>
  );
}
