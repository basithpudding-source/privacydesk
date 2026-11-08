// Turns database rows into the deadline engine's input, so the case page can show the
// working step by step. The database view stays the source for list sorting; this is the
// explanation, and the page checks the two agree.
import { caseClock, type CaseClock, type CaseInput, type Holidays } from "@/lib/clocks";
import type { CaseRow, ClockPauseRow } from "./types";

export function toCaseInput(c: CaseRow, pauses: ClockPauseRow[]): CaseInput {
  if (c.type === "complaint") {
    return { type: "complaint", receivedOn: c.received_on, acknowledgedOn: c.acknowledged_on };
  }
  return {
    type: c.type,
    receivedOn: c.received_on,
    idRequired: c.id_required,
    idReceivedOn: c.id_received_on,
    extended: c.extended,
    pauses: pauses.map((p) => ({ from: p.paused_on, to: p.resumed_on })),
  };
}

export function clockFor(c: CaseRow, pauses: ClockPauseRow[], holidays: Holidays): CaseClock {
  return caseClock(toCaseInput(c, pauses), holidays);
}

/** The engine's answer for the open deadline, to compare with the view's. */
export function engineDue(clock: CaseClock): string | null {
  return clock.kind === "complaint" ? clock.ackDue : clock.due;
}
