// The dashboard's numbers, worked out from rows of pd.v_case_deadlines. Pure, so it is
// testable without a database. "On time" counts complaint acknowledgements and closed
// requests against their legal limits, as the prototype did.
import { addMonthsClamped, type ISODate } from "@/lib/clocks";
import type { DeadlineRow } from "@/lib/cases/types";

export interface DashboardOrg {
  id: string;
  name: string;
  colour: string;
}

export interface MonthCount {
  /** YYYY-MM */
  month: string;
  /** "Jun 26" */
  label: string;
  complaint: number;
  sar: number;
  other: number;
}

export interface ClientRow extends DashboardOrg {
  open: number;
  dueWeek: number;
  overdue: number;
  receivedThisMonth: number;
  measured: number;
  met: number;
}

export interface AttentionRow {
  case_id: string;
  ref: string;
  type: DeadlineRow["type"];
  organisation: DashboardOrg;
  dueOn: ISODate;
  daysLeft: number;
  clock_state: DeadlineRow["clock_state"];
}

export interface DashboardSummary {
  open: number;
  dueWeek: number;
  overdue: number;
  measured: number;
  met: number;
  attention: AttentionRow[];
  months: MonthCount[];
  clients: ClientRow[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The date the row's clock points at: the acknowledgement for a complaint, else the response. */
export function nextDue(r: DeadlineRow): ISODate | null {
  return r.type === "complaint" ? r.ack_due : r.response_due;
}

const isOpen = (r: DeadlineRow) => r.status === "open";
const isOverdue = (r: DeadlineRow) => isOpen(r) && r.days_left !== null && r.days_left < 0;
const dueWithinWeek = (r: DeadlineRow) => isOpen(r) && r.days_left !== null && r.days_left >= 0 && r.days_left <= 7;

export function summarise(rows: DeadlineRow[], orgs: DashboardOrg[], today: ISODate): DashboardSummary {
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const measuredRows = rows.filter((r) => r.met_on_time !== null);

  const attention: AttentionRow[] = rows
    .filter((r) => isOpen(r) && r.days_left !== null && r.days_left <= 7)
    .map((r) => ({
      case_id: r.case_id,
      ref: r.ref,
      type: r.type,
      organisation: orgById.get(r.organisation_id) ?? { id: r.organisation_id, name: "", colour: "#888888" },
      dueOn: nextDue(r) as ISODate,
      daysLeft: r.days_left as number,
      clock_state: r.clock_state,
    }))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.ref.localeCompare(b.ref));

  // The last six months, oldest first, counted by the month the case was received.
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const months: MonthCount[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMonthsClamped(firstOfMonth, -i).slice(0, 7);
    const inMonth = rows.filter((r) => r.received_on.slice(0, 7) === m);
    months.push({
      month: m,
      label: `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`,
      complaint: inMonth.filter((r) => r.type === "complaint").length,
      sar: inMonth.filter((r) => r.type === "sar").length,
      other: inMonth.filter((r) => r.type !== "complaint" && r.type !== "sar").length,
    });
  }

  const thisMonth = today.slice(0, 7);
  const clients: ClientRow[] = orgs.map((o) => {
    const cs = rows.filter((r) => r.organisation_id === o.id);
    const ms = cs.filter((r) => r.met_on_time !== null);
    return {
      ...o,
      open: cs.filter(isOpen).length,
      dueWeek: cs.filter(dueWithinWeek).length,
      overdue: cs.filter(isOverdue).length,
      receivedThisMonth: cs.filter((r) => r.received_on.slice(0, 7) === thisMonth).length,
      measured: ms.length,
      met: ms.filter((r) => r.met_on_time).length,
    };
  });

  return {
    open: rows.filter(isOpen).length,
    dueWeek: rows.filter(dueWithinWeek).length,
    overdue: rows.filter(isOverdue).length,
    measured: measuredRows.length,
    met: measuredRows.filter((r) => r.met_on_time).length,
    attention,
    months,
    clients,
  };
}
