// Privacy Desk deadline engine (TypeScript port of packages/clocks/clocks.js).
// Dates are 'YYYY-MM-DD' strings, handled in UTC so time zones never shift a day.
// Rules follow the ICO's published guidance:
//  - complaints: acknowledge within 30 days; day 1 is the day after receipt; a deadline on a
//    weekend or public holiday moves to the end of the next working day.
//  - SARs: one calendar month from the day of receipt (or of ID); same date next month, or the
//    last day of that month if the date doesn't exist; next working day if it lands on a
//    weekend or bank holiday; extension to three months from the start; stop-the-clock pauses
//    on the day clarification is requested and resumes the day after it arrives.
//
// Never change a date rule here without adding a test built from an ICO worked example
// (see clocks.test.ts and CLAUDE.md).

/** A calendar date as 'YYYY-MM-DD'. */
export type ISODate = string;

/** Case types, matching the check constraint on pd.cases.type. */
export type CaseType = "complaint" | "sar" | "erasure" | "rectification" | "objection";

/** Rights requests: every case type except a complaint. All run on one calendar month. */
export type RequestType = Exclude<CaseType, "complaint">;

/** Bank holiday regions, matching pd.bank_holidays.region. */
export type Region = "england-and-wales" | "scotland" | "northern-ireland";

/** The set of bank holiday dates to treat as non-working days. */
export type Holidays = ReadonlySet<ISODate>;

export interface ClockPause {
  /** Day clarification was requested; the clock stops on this day. */
  from: ISODate;
  /** Day clarification arrived; the clock resumes the day after. Absent while still waiting. */
  to?: ISODate | null;
}

export interface ComplaintInput {
  receivedOn: ISODate;
  acknowledgedOn?: ISODate | null;
}

export interface RequestInput {
  receivedOn: ISODate;
  idRequired?: boolean;
  idReceivedOn?: ISODate | null;
  extended?: boolean;
  pauses?: ReadonlyArray<ClockPause>;
}

export type CaseInput =
  | ({ type: "complaint" } & ComplaintInput)
  | ({ type: RequestType } & RequestInput);

export interface ComplaintClock {
  kind: "complaint";
  state: "awaiting_ack" | "acknowledged";
  /** Legal acknowledgement deadline. */
  ackDue: ISODate;
  /** The open deadline, or null once acknowledged. */
  due: ISODate | null;
  /** The working, in plain English, one step per line. */
  steps: string[];
}

export interface RequestClock {
  kind: RequestType;
  state: "waiting_id" | "running" | "extended" | "paused";
  /** Day the clock started (receipt, or ID received). Null while waiting for ID. */
  start: ISODate | null;
  /** The legal response deadline, or null while the clock is stopped or waiting for ID. */
  due: ISODate | null;
  /** Deadline as it stands if an open pause ended today. Null while waiting for ID. */
  provisionalDue: ISODate | null;
  /** Days added by completed pauses. */
  pausedDays: number;
  /** Any extension must be notified by this date (one month from start). */
  extensionNoticeBy: ISODate | null;
  steps: string[];
}

export type CaseClock = ComplaintClock | RequestClock;

export const BANK_HOLIDAYS_ENGLAND_WALES: readonly ISODate[] = [
  // 2026
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31",
  "2026-12-25", "2026-12-28",
  // 2027
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30",
  "2027-12-27", "2027-12-28",
];

const DAY = 86400000;

function toDate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toStr(dt: Date): ISODate {
  return dt.toISOString().slice(0, 10);
}

export function addDays(s: ISODate, n: number): ISODate {
  return toStr(new Date(toDate(s).getTime() + n * DAY));
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}

/** Same day-of-month n months on, or the last day of that month if the day does not exist. */
export function addMonthsClamped(s: ISODate, months: number): ISODate {
  const [y, m, d] = s.split("-").map(Number);
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return toStr(new Date(Date.UTC(ty, tm, Math.min(d, lastDay))));
}

export function isWorkingDay(s: ISODate, holidays: Holidays): boolean {
  const dow = toDate(s).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(s);
}

export function nextWorkingDay(s: ISODate, holidays: Holidays): ISODate {
  let cur = s;
  while (!isWorkingDay(cur, holidays)) cur = addDays(cur, 1);
  return cur;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

/** "Monday 23 November 2026": the format for case pages. */
export function longDate(s: ISODate): string {
  const dt = toDate(s);
  return `${WEEKDAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** "23 Nov 2026": the format for tables. */
export function shortDate(s: ISODate): string {
  const dt = toDate(s);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()].slice(0, 3)} ${dt.getUTCFullYear()}`;
}

function whyNotWorking(s: ISODate, holidays: Holidays): string {
  const dow = toDate(s).getUTCDay();
  if (dow === 0 || dow === 6) return "a weekend";
  if (holidays.has(s)) return "a bank holiday";
  return "";
}

/** Complaint: acknowledgement deadline. */
export function complaintClock(c: ComplaintInput, holidays: Holidays): ComplaintClock {
  const steps: string[] = [];
  const day30 = addDays(c.receivedOn, 30);
  steps.push(`Received ${longDate(c.receivedOn)}. Day 1 is the next day, so day 30 is ${longDate(day30)}.`);
  const ackDue = nextWorkingDay(day30, holidays);
  if (ackDue !== day30) {
    steps.push(`That is ${whyNotWorking(day30, holidays)}, so the deadline moves to the next working day: ${longDate(ackDue)}.`);
  }
  return {
    kind: "complaint",
    state: c.acknowledgedOn ? "acknowledged" : "awaiting_ack",
    ackDue,
    due: c.acknowledgedOn ? null : ackDue,
    steps,
  };
}

/** SAR: response deadline, with ID, stop-the-clock and extension. */
export function sarClock(c: RequestInput, holidays: Holidays): RequestClock {
  return requestClock("sar", c, holidays);
}

function requestClock(kind: RequestType, c: RequestInput, holidays: Holidays): RequestClock {
  const steps: string[] = [];
  if (c.idRequired && !c.idReceivedOn) {
    steps.push("ID has been requested. The one-month clock starts when it arrives.");
    return {
      kind, state: "waiting_id", start: null, due: null, provisionalDue: null,
      pausedDays: 0, extensionNoticeBy: null, steps,
    };
  }
  const start: ISODate = c.idRequired ? (c.idReceivedOn as ISODate) : c.receivedOn;
  steps.push(c.idRequired
    ? `ID received ${longDate(start)}: the clock starts that day.`
    : `Received ${longDate(start)}: the clock starts that day.`);

  const months = c.extended ? 3 : 1;
  const base = addMonthsClamped(start, months);
  const sd = Number(start.slice(8, 10));
  const bd = Number(base.slice(8, 10));
  steps.push(`${months === 3 ? "Extended: three" : "One"} calendar month${months === 3 ? "s" : ""} later is ${longDate(base)}${bd !== sd ? " (that month has no matching date, so it is the last day of the month)" : ""}.`);

  let pausedDays = 0;
  let openPause: ClockPause | null = null;
  for (const p of c.pauses ?? []) {
    if (p.to) {
      const n = daysBetween(p.from, p.to) + 1;
      pausedDays += n;
      steps.push(`Clock stopped ${shortDate(p.from)} for clarification, received ${shortDate(p.to)}: ${n} day${n === 1 ? "" : "s"} added.`);
    } else {
      openPause = p;
    }
  }
  const shifted = addDays(base, pausedDays);
  const due = nextWorkingDay(shifted, holidays);
  if (due !== shifted) {
    steps.push(`${longDate(shifted)} is ${whyNotWorking(shifted, holidays)}, so the deadline moves to ${longDate(due)}.`);
  }
  const oneMonth = nextWorkingDay(addMonthsClamped(start, 1), holidays);
  if (openPause) {
    steps.push(`Clock stopped since ${longDate(openPause.from)} while waiting for clarification. The deadline moves back once it arrives.`);
  }
  return {
    kind,
    state: openPause ? "paused" : (c.extended ? "extended" : "running"),
    start,
    due: openPause ? null : due,
    provisionalDue: due,
    pausedDays,
    extensionNoticeBy: oneMonth,
    steps,
  };
}

/** Works out the clock for any case. Erasure, rectification and objection run on the SAR rule. */
export function caseClock(c: CaseInput, holidays: Holidays): CaseClock {
  if (c.type === "complaint") return complaintClock(c, holidays);
  return requestClock(c.type, c, holidays);
}
