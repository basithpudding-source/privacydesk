// The live parts of the dashboard, worked out from rows of pd.v_case_deadlines. Pure, so it
// is testable without a database. It only counts and groups: every date and every "days
// left" comes from the deadlines view, so no deadline rule lives here.
import { addDays, daysBetween, type CaseType, type ISODate } from "@/lib/clocks";
import type { DeadlineRow } from "@/lib/cases/types";
import { nextDue, type DashboardOrg } from "./summary";

/** Where an open case stands, in the order the queue reads: most pressing first. */
export type QueueBucket = "overdue" | "today" | "soon" | "onTrack" | "notRunning" | "acknowledged";

export const BUCKETS: { key: QueueBucket; label: string; tone: "danger" | "warn" | "ok" | "neutral" }[] = [
  { key: "overdue", label: "Overdue", tone: "danger" },
  { key: "today", label: "Due today", tone: "warn" },
  { key: "soon", label: "Due in 1 to 5 days", tone: "warn" },
  { key: "onTrack", label: "On track", tone: "ok" },
  { key: "notRunning", label: "Clock not running", tone: "neutral" },
  { key: "acknowledged", label: "Acknowledged", tone: "neutral" },
];

/** The bucket for an open case. The 5-day line matches the amber state on the case list. */
export function bucketOf(r: DeadlineRow): QueueBucket {
  if (r.clock_state === "waiting_id" || r.clock_state === "paused") return "notRunning";
  if (r.clock_state === "acknowledged" || r.days_left === null) return "acknowledged";
  if (r.days_left < 0) return "overdue";
  if (r.days_left === 0) return "today";
  if (r.days_left <= 5) return "soon";
  return "onTrack";
}

export type BucketCounts = Record<QueueBucket, number>;

const emptyCounts = (): BucketCounts => ({ overdue: 0, today: 0, soon: 0, onTrack: 0, notRunning: 0, acknowledged: 0 });

export interface ClientBoardRow extends DashboardOrg, BucketCounts {
  open: number;
  /** Inbox messages nobody has decided yet. */
  inbox: number;
  measured: number;
  met: number;
}

export interface TypeRow extends BucketCounts {
  type: CaseType;
  open: number;
  /** This type's share of all open cases, 0 to 1. */
  share: number;
}

export interface CalendarCase {
  case_id: string;
  ref: string;
  type: CaseType;
  colour: string;
  organisation: string;
}

export interface CalendarDay {
  date: ISODate;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
  cases: CalendarCase[];
}

export interface LiveBoard {
  open: number;
  queue: BucketCounts;
  /** Of the cases whose clock is not running: waiting for proof of identity. */
  waitingId: number;
  /** Of the cases whose clock is not running: waiting for a clarification. */
  paused: number;
  inbox: number;
  clients: ClientBoardRow[];
  types: TypeRow[];
  /** Whole weeks, Monday first, starting with the week today is in. */
  weeks: CalendarDay[][];
  /** Open cases due before the first day shown: already overdue. */
  dueEarlier: number;
  /** Open cases due after the last day shown. */
  dueLater: number;
}

const TYPE_ORDER: CaseType[] = ["sar", "complaint", "erasure", "rectification", "objection"];
export const CALENDAR_WEEKS = 5;

/** Monday of the week a date is in. 1 January 2024 was a Monday. */
function mondayOf(day: ISODate): ISODate {
  const offset = ((daysBetween("2024-01-01", day) % 7) + 7) % 7;
  return addDays(day, -offset);
}

export function liveBoard(rows: DeadlineRow[], orgs: DashboardOrg[], inboxByOrg: ReadonlyMap<string, number>, today: ISODate): LiveBoard {
  const open = rows.filter((r) => r.status === "open");
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const queue = emptyCounts();
  for (const r of open) queue[bucketOf(r)]++;

  const clients: ClientBoardRow[] = orgs.map((o) => {
    const mine = rows.filter((r) => r.organisation_id === o.id);
    const counts = emptyCounts();
    for (const r of mine) if (r.status === "open") counts[bucketOf(r)]++;
    const measured = mine.filter((r) => r.met_on_time !== null);
    return {
      ...o,
      ...counts,
      open: mine.filter((r) => r.status === "open").length,
      inbox: inboxByOrg.get(o.id) ?? 0,
      measured: measured.length,
      met: measured.filter((r) => r.met_on_time).length,
    };
  });

  const types: TypeRow[] = TYPE_ORDER.map((type) => {
    const mine = open.filter((r) => r.type === type);
    const counts = emptyCounts();
    for (const r of mine) counts[bucketOf(r)]++;
    return { type, ...counts, open: mine.length, share: open.length ? mine.length / open.length : 0 };
  }).filter((t) => t.open > 0);

  // The calendar shows the date each running clock points at. A stopped clock has no date.
  const first = mondayOf(today);
  const last = addDays(first, CALENDAR_WEEKS * 7 - 1);
  const dated = open.filter((r) => bucketOf(r) !== "notRunning" && bucketOf(r) !== "acknowledged" && nextDue(r));
  const byDay = new Map<ISODate, CalendarCase[]>();
  let dueEarlier = 0;
  let dueLater = 0;
  for (const r of dated) {
    const due = nextDue(r) as ISODate;
    if (due < first) dueEarlier++;
    else if (due > last) dueLater++;
    else {
      const org = orgById.get(r.organisation_id);
      byDay.set(due, [...(byDay.get(due) ?? []), { case_id: r.case_id, ref: r.ref, type: r.type, colour: org?.colour ?? "#888888", organisation: org?.name ?? "" }]);
    }
  }
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < CALENDAR_WEEKS; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d);
      week.push({ date, isToday: date === today, isPast: date < today, isWeekend: d >= 5, cases: (byDay.get(date) ?? []).sort((a, b) => a.ref.localeCompare(b.ref)) });
    }
    weeks.push(week);
  }

  return {
    open: open.length,
    queue,
    waitingId: open.filter((r) => r.clock_state === "waiting_id").length,
    paused: open.filter((r) => r.clock_state === "paused").length,
    inbox: orgs.reduce((n, o) => n + (inboxByOrg.get(o.id) ?? 0), 0),
    clients,
    types,
    weeks,
    dueEarlier,
    dueLater,
  };
}
