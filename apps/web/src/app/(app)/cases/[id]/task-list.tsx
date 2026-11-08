import Link from "next/link";
import type { CaseAction, CaseRow, ClockPauseRow } from "@/lib/cases/types";
import { shortDate } from "@/lib/clocks";
import { cn } from "@/lib/utils";

type TaskStatus = "Completed" | "In progress" | "Not started" | "Not needed" | "Cannot start yet";

interface Task {
  title: string;
  detail: string;
  status: TaskStatus;
  /** The action the row opens, when one applies. */
  action?: CaseAction;
}

/**
 * GOV.UK task list: the steps of the process in order, each with a status word
 * (adjectives in sentence case, never verbs). The whole row is clickable.
 */
export function TaskList({ c, pauses, canWrite, caseId }: { c: CaseRow; pauses: ClockPauseRow[]; canWrite: boolean; caseId: string }) {
  const closed = c.status === "closed";
  const openPause = pauses.find((p) => p.resumed_on === null);
  const lastPause = pauses[pauses.length - 1];
  const clockStarted = !c.id_required || Boolean(c.id_received_on);

  const tasks: Task[] = [
    {
      title: "Received",
      detail: `${shortDate(c.received_on)} by ${c.channel.toLowerCase()}${c.source_ref ? ` (reference ${c.source_ref}, email address verified)` : ""}`,
      status: "Completed",
    },
  ];

  if (c.type !== "complaint") {
    tasks.push(
      !c.id_required
        ? { title: "Identity checked", detail: "Not needed. Ask for ID only if the address does not match records or the data is sensitive.", status: "Not needed", action: closed ? undefined : "ask_id" }
        : c.id_received_on
          ? { title: "Identity checked", detail: `Received ${shortDate(c.id_received_on)}; the clock started that day`, status: "Completed" }
          : { title: "Identity checked", detail: "Requested; the clock waits until it arrives", status: "In progress", action: closed ? undefined : "id_received" },
    );
    tasks.push(
      openPause
        ? { title: "Scope clarified", detail: `Asked ${shortDate(openPause.paused_on)} (clock stopped): ${openPause.note ?? ""}`, status: "In progress", action: closed ? undefined : "resume" }
        : lastPause
          ? { title: "Scope clarified", detail: `Received ${shortDate(lastPause.resumed_on as string)}`, status: "Completed", action: closed ? undefined : "pause" }
          : { title: "Scope clarified", detail: clockStarted ? "Not needed unless the request is too vague to search. Asking stops the clock." : "Cannot start until the clock is running", status: clockStarted ? "Not needed" : "Cannot start yet", action: closed || !clockStarted ? undefined : "pause" },
    );
  }

  tasks.push(
    c.acknowledged_on
      ? { title: "Acknowledged", detail: shortDate(c.acknowledged_on), status: "Completed" }
      : { title: "Acknowledged", detail: c.type === "complaint" ? "Within 30 days; this is the legal deadline for a complaint" : "Good practice, not a legal step", status: "Not started", action: closed ? undefined : "acknowledge" },
  );

  if (c.type !== "complaint") {
    tasks.push(
      c.extended
        ? { title: "Extended", detail: `Person told ${shortDate(c.extended_on as string)}; three months from the start`, status: "Completed" }
        : { title: "Extended", detail: clockStarted ? "Only if the request is complex or numerous; tell the person within one month" : "Cannot start until the clock is running", status: clockStarted ? "Not needed" : "Cannot start yet", action: closed || !clockStarted ? undefined : "extend" },
    );
    tasks.push({
      title: "Data gathered",
      detail: closed ? "Done" : "Add notes as the search progresses",
      status: closed ? "Completed" : "In progress",
      action: "note",
    });
  }

  tasks.push(
    closed
      ? { title: c.type === "complaint" ? "Outcome sent" : "Response sent", detail: `${shortDate(c.closed_on as string)}: ${c.outcome ?? "closed"}`, status: "Completed", action: "reopen" }
      : { title: c.type === "complaint" ? "Outcome sent" : "Response sent", detail: c.type === "complaint" ? "Close with the outcome of the complaint" : "Close once the response has gone", status: "Not started", action: "close" },
  );

  return (
    <ol className="divide-y divide-border rounded-lg border border-border">
      {tasks.map((t) => {
        const clickable = canWrite && t.action;
        const inner = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t.title}</span>
              <span className="block text-sm text-muted-foreground">{t.detail}</span>
            </span>
            <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-medium", STATUS_CLASSES[t.status])}>{t.status}</span>
          </>
        );
        return (
          <li key={t.title}>
            {clickable ? (
              <Link
                href={`/cases/${caseId}?do=${t.action}`}
                scroll={false}
                className="flex items-center gap-4 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-4 px-4 py-3">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const STATUS_CLASSES: Record<TaskStatus, string> = {
  Completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  "In progress": "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  "Not started": "bg-muted text-foreground",
  "Not needed": "bg-muted text-muted-foreground",
  "Cannot start yet": "bg-muted text-muted-foreground",
};
