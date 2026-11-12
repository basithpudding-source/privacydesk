import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Tag, TONE_SOLID } from "@/components/ui/tag";
import { clockLabel, urgencyFor, URGENCY_TONE } from "@/lib/cases/labels";
import type { DeadlineRow } from "@/lib/cases/types";
import { longDate, shortDate, type CaseClock } from "@/lib/clocks";
import { cn } from "@/lib/utils";
import { PANE_ROW, PANE_SECOND } from "./pane-grid";

/**
 * The top pane of a case. The due date is the largest thing on the page; beside it, the
 * working in numbered steps. Three visual states (fine, warning, overdue); paused and
 * waiting-for-ID are grey with a sentence saying what restarts the clock. The internal target
 * is visibly a target.
 *
 * Under the date, in the same pane, sits a second row (case-facts.tsx): the case's details
 * and the request as the person sent it, closed until asked for. That leaves the column
 * beside the page for recording steps and the audit trail. The pane lays itself out by its
 * own width, not the window's: two columns when there is room, one when there is not.
 */
export function DeadlineBlock({
  clock,
  deadline,
  engineDue,
  internalTarget,
  internalTargetDays,
  regionLabel,
  holidayCount,
  returned = false,
  facts,
}: {
  clock: CaseClock;
  deadline: DeadlineRow;
  engineDue: string | null;
  internalTarget: string | null;
  internalTargetDays: number;
  regionLabel: string;
  holidayCount: number;
  /** The case was returned to the inbox: closed, and not measured against its deadline. */
  returned?: boolean;
  /** The second row of the pane: the case's details and the request as received. */
  facts?: ReactNode;
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

  const tone = URGENCY_TONE[urgency];
  // Balanced, so a date too long for a narrow pane does not leave the year alone on a line.
  const big = "text-balance text-3xl font-semibold tracking-tight";

  return (
    <div className="surface @container relative overflow-hidden">
      {/* The edge repeats the state for scanning; the tag below carries the words. */}
      <span className={cn("absolute inset-y-0 left-0 w-1.5", closed ? "bg-muted-foreground/30" : TONE_SOLID[tone])} aria-hidden="true" />
      <div className={cn(PANE_ROW, "py-5")}>
        <section aria-labelledby="deadline-heading" className="min-w-0">
          <h2 id="deadline-heading" className="section-label">
            {heading}
          </h2>

          {closed ? (
            <p className={cn("mt-1.5", big)}>{returned ? "Returned to the inbox" : deadline.met_on_time === false ? "Late" : deadline.met_on_time ? "On time" : "Closed"}</p>
          ) : acknowledged ? (
            <p className={cn("mt-1.5", big)}>{viewDue ? longDate(viewDue) : "Done"}</p>
          ) : stopped ? (
            <p className={cn("mt-1.5 text-muted-foreground", big)}>{deadline.clock_state === "waiting_id" ? "Waiting for ID" : "Clock stopped"}</p>
          ) : (
            <p className={cn("mt-1.5 sm:text-4xl", big)}>{viewDue ? longDate(viewDue) : "Not set"}</p>
          )}

          {!closed && (
            <p className="mt-3">
              <Tag tone={tone} dot className="px-2.5 py-1 text-sm">
                {clockLabel(deadline.clock_state, deadline.days_left)}
              </Tag>
            </p>
          )}

          {stopped && (
            <p className="mt-3 max-w-[65ch] text-sm">
              {deadline.clock_state === "waiting_id"
                ? "The one-month clock starts on the day proof of identity arrives. Record it with “ID received”."
                : "The clock restarts the day after the clarification arrives. Record it with “Clarification received”."}
              {clock.kind !== "complaint" && clock.provisionalDue && deadline.clock_state === "paused" && (
                <> If it arrived today the deadline would be {longDate(clock.provisionalDue)}.</>
              )}
            </p>
          )}

          {internalTarget && !closed && (
            <p className="mt-4 text-sm text-muted-foreground">
              Internal target: <span className="font-medium text-foreground">{shortDate(internalTarget)}</span> ({internalTargetDays} days). A target for the team, not a legal limit.
            </p>
          )}
        </section>

        <div className={PANE_SECOND}>
          <h3 className="section-label">How this date is worked out</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm marker:text-muted-foreground">
            {clock.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
            {!closed && !stopped && viewDue && <li className="font-medium">The deadline is {longDate(viewDue)}.</li>}
          </ol>

          {clock.kind !== "complaint" && clock.extensionNoticeBy && !clock.steps.some((s) => s.startsWith("Extended")) && !closed && !stopped && (
            <p className="mt-3 text-sm text-muted-foreground">
              If the request is complex, an extension to three months must be notified by {shortDate(clock.extensionNoticeBy)}.
            </p>
          )}
        </div>
      </div>

      {(holidayCount === 0 || mismatch) && (
        <div className="space-y-2 border-t border-border py-3 pl-7 pr-5">
          {holidayCount === 0 && (
            <p className="flex items-start gap-2 text-sm text-warn-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              No bank holidays are loaded for {regionLabel} yet, so this date ignores them. The nightly job loads them.
            </p>
          )}
          {mismatch && (
            <p className="flex items-start gap-2 text-sm text-danger-fg" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              The two deadline calculations disagree ({engineDue ?? "none"} in the app, {viewDue ?? "none"} in the database). Do not rely on this date; report it.
            </p>
          )}
        </div>
      )}

      {facts}
    </div>
  );
}
