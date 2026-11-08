import { AlertTriangle } from "lucide-react";
import { clockLabel, urgencyFor, URGENCY_CLASSES } from "@/lib/cases/labels";
import type { DeadlineRow } from "@/lib/cases/types";
import { longDate, shortDate, type CaseClock } from "@/lib/clocks";
import { cn } from "@/lib/utils";

/**
 * The due date is the largest thing on the page; under it, the working in numbered steps.
 * Three visual states (fine, warning, overdue); paused and waiting-for-ID are grey with a
 * sentence saying what restarts the clock. The internal target is visibly a target.
 */
export function DeadlineBlock({
  clock,
  deadline,
  engineDue,
  internalTarget,
  internalTargetDays,
  regionLabel,
  holidayCount,
}: {
  clock: CaseClock;
  deadline: DeadlineRow;
  engineDue: string | null;
  internalTarget: string | null;
  internalTargetDays: number;
  regionLabel: string;
  holidayCount: number;
}) {
  const viewDue = deadline.type === "complaint" ? deadline.ack_due : deadline.response_due;
  const urgency = urgencyFor(deadline.clock_state, deadline.days_left);
  const closed = deadline.status === "closed";
  const stopped = deadline.clock_state === "waiting_id" || deadline.clock_state === "paused";
  const acknowledged = deadline.clock_state === "acknowledged";
  const mismatch = !closed && !stopped && engineDue !== viewDue;

  const heading = closed
    ? "Closed"
    : acknowledged
      ? "Acknowledged"
      : deadline.type === "complaint"
        ? "Acknowledge by"
        : stopped
          ? "Clock not running"
          : "Respond by";

  return (
    <section aria-labelledby="deadline-heading" className="rounded-lg border border-border p-5">
      <h2 id="deadline-heading" className="text-sm font-medium text-muted-foreground">
        {heading}
      </h2>

      {closed ? (
        <p className="mt-1 text-3xl font-semibold tracking-tight">
          {deadline.met_on_time === false ? "Late" : deadline.met_on_time ? "On time" : "Closed"}
        </p>
      ) : acknowledged ? (
        <p className="mt-1 text-3xl font-semibold tracking-tight">{viewDue ? longDate(viewDue) : "Done"}</p>
      ) : stopped ? (
        <p className="mt-1 text-3xl font-semibold tracking-tight text-muted-foreground">
          {deadline.clock_state === "waiting_id" ? "Waiting for ID" : "Clock stopped"}
        </p>
      ) : (
        <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{viewDue ? longDate(viewDue) : "Not set"}</p>
      )}

      {!closed && (
        <p className="mt-2">
          <span className={cn("inline-block rounded-md px-2 py-0.5 text-sm font-medium", URGENCY_CLASSES[urgency])}>
            {clockLabel(deadline.clock_state, deadline.days_left)}
          </span>
        </p>
      )}

      {stopped && (
        <p className="mt-3 text-sm">
          {deadline.clock_state === "waiting_id"
            ? "The one-month clock starts on the day proof of identity arrives. Record it with “ID received”."
            : "The clock restarts the day after the clarification arrives. Record it with “Clarification received”."}
          {clock.kind !== "complaint" && clock.provisionalDue && deadline.clock_state === "paused" && (
            <> If it arrived today the deadline would be {longDate(clock.provisionalDue)}.</>
          )}
        </p>
      )}

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        {clock.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
        {!closed && !stopped && viewDue && <li>The deadline is {longDate(viewDue)}.</li>}
      </ol>

      {clock.kind !== "complaint" && clock.extensionNoticeBy && !clock.steps.some((s) => s.startsWith("Extended")) && !closed && !stopped && (
        <p className="mt-3 text-sm text-muted-foreground">
          If the request is complex, an extension to three months must be notified by {shortDate(clock.extensionNoticeBy)}.
        </p>
      )}

      {internalTarget && !closed && (
        <p className="mt-3 text-sm text-muted-foreground">
          Internal target: {shortDate(internalTarget)} ({internalTargetDays} days). A target for the team, not a legal limit.
        </p>
      )}

      {holidayCount === 0 && (
        <p className="mt-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          No bank holidays are loaded for {regionLabel} yet, so this date ignores them. They arrive in build slice 6.
        </p>
      )}

      {mismatch && (
        <p className="mt-3 flex items-start gap-2 text-sm text-red-700 dark:text-red-300" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          The two deadline calculations disagree ({engineDue ?? "none"} in the app, {viewDue ?? "none"} in the database). Do not rely on this date; report it.
        </p>
      )}
    </section>
  );
}
