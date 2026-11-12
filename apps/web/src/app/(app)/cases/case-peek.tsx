import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag, TONE_SOLID } from "@/components/ui/tag";
import { clockLabel, typeLabel, urgencyFor, URGENCY_TONE } from "@/lib/cases/labels";
import type { CaseDetail } from "@/lib/cases/queries";
import { longDate, shortDate } from "@/lib/clocks";
import { londonDate } from "@/lib/today";
import { cn } from "@/lib/utils";
import { buildTasks, nextStep } from "./[id]/task-list";

/**
 * A case at a glance beside the list: the deadline, who and what, the latest events and the
 * next step, so a row can be checked and acted on without leaving the table. The full page
 * (the working of the date, every step, letters) is one click away.
 */
export function CasePeek({ detail, closeHref, canWrite, sticky = true, newWindow = false }: { detail: CaseDetail; closeHref: string; canWrite: boolean; sticky?: boolean; newWindow?: boolean }) {
  const target = newWindow ? { target: "_blank", rel: "noopener" } : {};
  const { c, org, deadline, pauses, events } = detail;
  const closed = c.status === "closed";
  const due = c.type === "complaint" ? deadline.ack_due : deadline.response_due;
  const tone = URGENCY_TONE[urgencyFor(deadline.clock_state, deadline.days_left)];
  const next = canWrite ? nextStep(buildTasks(c, pauses), c.type === "complaint") : null;

  return (
    <aside aria-labelledby="peek-heading" className={cn("surface relative flex min-w-0 flex-col overflow-hidden", sticky && "xl:sticky xl:top-20 xl:max-h-[calc(100vh-6.5rem)]")}>
      <span className={cn("absolute inset-x-0 top-0 h-1", closed ? "bg-muted-foreground/30" : TONE_SOLID[tone])} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h2 id="peek-heading" className="font-semibold">
            <span className="font-mono">{c.ref}</span> <span className="font-normal text-muted-foreground">·</span> {typeLabel(c.type)}
          </h2>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: org.colour }} aria-hidden="true" />
            <span className="truncate">{org.name}</span>
          </p>
        </div>
        <Link href={closeHref} scroll={false} className="rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" title="Close the preview" aria-label="Close the preview">
          <X className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div>
          <p className="section-label">{closed ? "Closed" : c.type === "complaint" ? "Acknowledge by" : "Respond by"}</p>
          <p className="mt-1 text-xl font-semibold tracking-tight">
            {closed ? (deadline.met_on_time === false ? "Late" : deadline.met_on_time ? "On time" : "Closed") : due ? longDate(due) : "Clock not running"}
          </p>
          {!closed && (
            <p className="mt-2">
              <Tag tone={tone} dot>
                {clockLabel(deadline.clock_state, deadline.days_left)}
              </Tag>
            </p>
          )}
        </div>

        <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">From</dt>
          <dd className="min-w-0">
            {c.requester_name ?? <span className="text-muted-foreground">Unknown</span>}
            {c.requester_email && <span className="block truncate text-muted-foreground" title={c.requester_email}>{c.requester_email}</span>}
          </dd>
          <dt className="text-muted-foreground">Received</dt>
          <dd>
            {shortDate(c.received_on)} by {c.channel.toLowerCase()}
          </dd>
          {deadline.internal_target && !closed && (
            <>
              <dt className="text-muted-foreground">Target</dt>
              <dd>{shortDate(deadline.internal_target)} <span className="text-muted-foreground">(internal, not a legal limit)</span></dd>
            </>
          )}
          {c.summary && (
            <>
              <dt className="text-muted-foreground">Summary</dt>
              <dd>{c.summary}</dd>
            </>
          )}
        </dl>

        {c.message && (
          <div>
            <p className="section-label">The request as received</p>
            <p className="mt-1.5 line-clamp-6 whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm">{c.message}</p>
          </div>
        )}

        <div>
          <p className="section-label">Latest on the audit trail</p>
          <ol className="mt-1.5 space-y-2 text-sm">
            {events.slice(0, 3).map((e) => (
              <li key={e.id}>
                <span className="line-clamp-2">{e.text}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{shortDate(londonDate(e.at))}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3.5">
        <Button size="lg" render={<Link href={`/cases/${c.id}`} {...target} />} nativeButton={false}>
          {newWindow ? "Open the case in a new window" : "Open the case"}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
        {next && (
          <Button variant="outline" size="lg" render={<Link href={`/cases/${c.id}?do=${next.action}`} />} nativeButton={false}>
            {next.label}
          </Button>
        )}
      </div>
    </aside>
  );
}
