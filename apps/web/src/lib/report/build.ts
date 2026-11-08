// The monthly client report as plain English, kept from the prototype (design standard §9).
// Pure: give it the numbers and the case rows and it gives back lines of text.
import { longDate, shortDate, type ISODate } from "@/lib/clocks";
import type { CaseType } from "@/lib/clocks";
import type { ClockState } from "@/lib/cases/labels";

/** One row of pd.v_monthly_client_report. */
export interface MonthNumbers {
  received: number;
  complaints: number;
  sars: number;
  complaints_acknowledged: number;
  acknowledged_on_time: number;
  closed: number;
  closed_on_time: number;
}

/** A case joined to the deadlines view: enough for the open and closed lists. */
export interface ReportCase {
  ref: string;
  type: CaseType;
  status: "open" | "closed";
  received_on: ISODate;
  closed_on: ISODate | null;
  outcome: string | null;
  clock_state: ClockState;
  ack_due: ISODate | null;
  response_due: ISODate | null;
  days_left: number | null;
}

export interface ReportInput {
  organisationName: string;
  /** YYYY-MM */
  month: string;
  numbers: MonthNumbers | null;
  cases: ReportCase[];
  today: ISODate;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NOUN: Record<string, [string, string]> = {
  complaint: ["complaint", "complaints"],
  sar: ["SAR", "SARs"],
  erasure: ["erasure request", "erasure requests"],
  rectification: ["rectification request", "rectification requests"],
  objection: ["objection", "objections"],
};
const TYPE_LABEL: Record<string, string> = {
  complaint: "Complaint",
  sar: "Subject access request",
  erasure: "Erasure request",
  rectification: "Rectification request",
  objection: "Objection",
};

export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** "respond by 8 Jan 2027", "acknowledge by 2 Dec 2026", "waiting for proof of identity"… */
export function nextStep(c: ReportCase): string {
  if (c.type === "complaint") {
    if (c.clock_state === "awaiting_ack") return `acknowledge by ${shortDate(c.ack_due as ISODate)}`;
    return "acknowledged; respond without undue delay";
  }
  switch (c.clock_state) {
    case "waiting_id":
      return "waiting for proof of identity (clock not started)";
    case "paused":
      return "clock stopped pending clarification";
    case "extended":
      return `respond by ${shortDate(c.response_due as ISODate)} (extended)`;
    default:
      return c.response_due ? `respond by ${shortDate(c.response_due)}` : "no deadline yet";
  }
}

export function buildReport(input: ReportInput): string {
  const { organisationName, month, numbers, cases, today } = input;
  const received = cases.filter((c) => c.received_on.slice(0, 7) === month);
  const closedIn = cases.filter((c) => c.status === "closed" && c.closed_on?.slice(0, 7) === month);
  const open = cases.filter((c) => c.status === "open");
  const overdue = open.filter((c) => c.days_left !== null && c.days_left < 0);
  const n = numbers ?? { received: received.length, complaints: 0, sars: 0, complaints_acknowledged: 0, acknowledged_on_time: 0, closed: closedIn.length, closed_on_time: 0 };

  const byType = Object.keys(NOUN)
    .map((k) => [k, received.filter((c) => c.type === k).length] as const)
    .filter(([, count]) => count > 0)
    .map(([k, count]) => `${count} ${NOUN[k][count === 1 ? 0 : 1]}`);

  const lines: string[] = [];
  lines.push(`Data protection cases: ${organisationName}, ${monthLabel(month)}`);
  lines.push("");
  lines.push(`Received: ${n.received}${byType.length ? ` (${byType.join(", ")})` : ""}.`);
  if (n.complaints_acknowledged) lines.push(`Complaints acknowledged: ${n.complaints_acknowledged}, ${n.acknowledged_on_time} within the 30-day limit.`);
  if (n.closed) lines.push(`Cases closed: ${n.closed}, ${n.closed_on_time} within their time limits.`);
  lines.push(`Open now: ${open.length}.`);
  if (overdue.length) lines.push(`Overdue now: ${overdue.length} (${overdue.map((c) => c.ref).join(", ")}).`);

  if (open.length) {
    lines.push("");
    lines.push("Open cases");
    for (const c of open) lines.push(`- ${c.ref}, ${TYPE_LABEL[c.type] ?? c.type}, received ${shortDate(c.received_on)}: ${nextStep(c)}.`);
  }
  if (closedIn.length) {
    lines.push("");
    lines.push("Closed this month");
    for (const c of closedIn) lines.push(`- ${c.ref}, ${TYPE_LABEL[c.type] ?? c.type}: ${c.outcome ?? "closed"} (${shortDate(c.closed_on as ISODate)}).`);
  }
  lines.push("");
  lines.push(`Prepared ${longDate(today)} from the Privacy Desk case register. Dates follow ICO guidance; software, not legal advice.`);
  return lines.join("\n");
}
