import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { Tag, type Tone } from "@/components/ui/tag";
import type { CaseAction, CaseRow, ClockPauseRow } from "@/lib/cases/types";
import { shortDate } from "@/lib/clocks";
import { cn } from "@/lib/utils";

type TaskStatus = "Completed" | "In progress" | "Not started" | "Not needed" | "Cannot start yet";

export interface Task {
  title: string;
  detail: string;
  status: TaskStatus;
  /** The action the row opens, when one applies. */
  action?: CaseAction;
}

/** The steps of the process in order, with where each one stands. */
export function buildTasks(c: CaseRow, pauses: ClockPauseRow[]): Task[] {
  const closed = c.status === "closed";
  const returned = Boolean(c.returned_to_inbox);
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
    tasks.push(
      returned
        ? { title: "Data gathered", detail: "Not finished: the case went back to the inbox first", status: "Not needed" }
        : {
            title: "Data gathered",
            detail: closed ? "Done" : "Add notes as the search progresses",
            status: closed ? "Completed" : "In progress",
            action: "note",
          },
    );
  }

  tasks.push(
    returned
      ? {
          // No response was sent: the last thing that happened to this case is the return.
          title: "Returned to the inbox",
          detail: `${shortDate(c.closed_on as string)}: ${(c.outcome ?? "").replace(/^Returned to the inbox:\s*/, "") || "no reason recorded"}`,
          status: "Completed",
        }
      : closed
      ? { title: c.type === "complaint" ? "Outcome sent" : "Response sent", detail: `${shortDate(c.closed_on as string)}: ${c.outcome ?? "closed"}`, status: "Completed", action: "reopen" }
      : { title: c.type === "complaint" ? "Outcome sent" : "Response sent", detail: c.type === "complaint" ? "Close with the outcome of the complaint" : "Close once the response has gone", status: "Not started", action: "close" },
  );

  return tasks;
}

/** Short button words for the step that should happen next. */
const NEXT_LABEL: Partial<Record<CaseAction, (isComplaint: boolean) => string>> = {
  id_received: () => "Record ID received",
  resume: () => "Record clarification received",
  acknowledge: () => "Mark acknowledged",
  close: (c) => (c ? "Close with outcome" : "Close: response sent"),
};

/**
 * The step to offer as the page's main button: something being waited for comes first
 * (ID, a clarification), then the first step not yet started.
 */
export function nextStep(tasks: Task[], isComplaint: boolean): { action: CaseAction; label: string } | null {
  const pick =
    tasks.find((t) => t.status === "In progress" && (t.action === "id_received" || t.action === "resume")) ??
    tasks.find((t) => t.status === "Not started" && t.action);
  const label = pick?.action ? NEXT_LABEL[pick.action]?.(isComplaint) : undefined;
  return pick?.action && label ? { action: pick.action, label } : null;
}

const STATUS_TONE: Record<TaskStatus, Tone> = {
  Completed: "ok",
  "In progress": "info",
  "Not started": "neutral",
  "Not needed": "neutral",
  "Cannot start yet": "neutral",
};

/**
 * GOV.UK task list: the steps of the process in order, each with a status word
 * (adjectives in sentence case, never verbs). The whole row is clickable.
 */
export function TaskList({ tasks, canWrite, caseId, active }: { tasks: Task[]; canWrite: boolean; caseId: string; active: CaseAction | null }) {
  return (
    <ol className="surface divide-y divide-border overflow-hidden">
      {tasks.map((t, i) => {
        const clickable = canWrite && t.action;
        const done = t.status === "Completed";
        const inner = (
          <>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                done ? "bg-ok-bg text-ok-fg" : t.status === "In progress" ? "bg-info-bg text-info-fg" : "bg-muted text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block font-medium", (t.status === "Not needed" || t.status === "Cannot start yet") && "text-muted-foreground")}>{t.title}</span>
              <span className="block text-sm text-muted-foreground">{t.detail}</span>
            </span>
            <Tag tone={STATUS_TONE[t.status]} className={t.status === "Not started" ? "text-foreground" : undefined}>
              {t.status}
            </Tag>
            <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground", !clickable && "invisible")} aria-hidden="true" />
          </>
        );
        return (
          <li key={t.title}>
            {clickable ? (
              <Link
                href={`/cases/${caseId}?do=${t.action}`}
                scroll={false}
                aria-current={active === t.action ? "true" : undefined}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  active === t.action && "bg-accent/60",
                )}
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
