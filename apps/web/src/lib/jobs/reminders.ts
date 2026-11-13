// Reminder digests: one email per person per night listing their cases that are overdue, due
// today, due within 2 days and due within 7 days. Internal mail to the consultancy's own
// staff, never to requesters. A stage is logged only once its email has gone, so a failed
// send or a missed night is made up on the next run (see migration 0012).
import { deskKindOf, deskWords } from "@/lib/desk";
import { longDate, type ISODate } from "@/lib/clocks";

/** One row of pd.reminders_due(). */
export interface ReminderRow {
  case_id: string;
  ref: string;
  type: string;
  clock_state: string;
  due_on: ISODate;
  /** The stage the case has reached: within 7 days, within 2, due today (0) or overdue (-1). */
  bucket: Bucket;
  organisation_id: string;
  organisation_name: string;
  partner_id: string;
  partner_name: string;
  /** 'consultancy' or 'organisation', added by the job from pd.partners; absent before migration 0022. */
  partner_kind?: string;
  user_id: string;
  email: string;
}

export type Bucket = 7 | 2 | 0 | -1;

export interface Digest {
  email: string;
  subject: string;
  text: string;
  caseIds: string[];
  /** The rows this digest covers, so each can be logged once the email has gone. */
  rows: ReminderRow[];
}

/** What pd.reminder_log records: one row per case, stage, due date and person. */
export interface ReminderLogRow {
  case_id: string;
  bucket: Bucket;
  due_on: ISODate;
  user_id: string;
  recipients: 1;
}

/**
 * Whether a digest counts as delivered. Only a real send does. The one exception is
 * development with no sender configured, where the email is printed to the server log
 * instead: in production an unconfigured sender is a failure, never a quiet success.
 */
export function delivered(result: { sent: boolean; reason?: "not-configured" | "failed" }, production: boolean): boolean {
  if (result.sent) return true;
  return result.reason === "not-configured" && !production;
}

/** Log rows for the digests that were delivered, and only those. */
export function logRowsFor(deliveredDigests: Digest[]): ReminderLogRow[] {
  return deliveredDigests.flatMap((d) =>
    d.rows.map((r) => ({ case_id: r.case_id, bucket: r.bucket, due_on: r.due_on, user_id: r.user_id, recipients: 1 as const })),
  );
}

const TYPE: Record<string, string> = {
  complaint: "complaint (acknowledgement due)",
  sar: "subject access request",
  erasure: "erasure request",
  rectification: "rectification request",
  objection: "objection",
};

function bucketHeading(b: Bucket): string {
  return b === -1 ? "Overdue" : b === 0 ? "Due today" : b === 2 ? "Due within 2 days" : "Due within 7 days";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Group rows by recipient and write each person's digest, most urgent first. */
export function buildDigests(rows: ReminderRow[], appUrl: string): Digest[] {
  const byEmail = new Map<string, ReminderRow[]>();
  for (const r of rows) byEmail.set(r.email, [...(byEmail.get(r.email) ?? []), r]);

  const digests: Digest[] = [];
  for (const [email, list] of byEmail) {
    const partner = list[0].partner_name;
    const lines: string[] = [];
    const today = list.filter((r) => r.bucket === 0).length;
    const overdue = list.filter((r) => r.bucket === -1).length;
    // An organisation's own desk has no clients, so neither the opening line nor each case names one.
    const words = deskWords(deskKindOf(list[0].partner_kind));
    lines.push(`${words.reminderLead(partner)}: ${plural(list.length, "case")}${overdue ? `, ${overdue} overdue` : ""}${today ? `, ${today} due today` : ""}.`);
    for (const b of [-1, 0, 2, 7] as const) {
      const group = list.filter((r) => r.bucket === b);
      if (!group.length) continue;
      lines.push("");
      lines.push(bucketHeading(b));
      for (const r of group) {
        lines.push(`- ${r.ref}, ${TYPE[r.type] ?? r.type}${words.hasClients ? `, ${r.organisation_name}` : ""}: ${longDate(r.due_on)}. ${appUrl}/cases/${r.case_id}`);
      }
    }
    lines.push("");
    lines.push("Dates follow ICO guidance. This is an automatic reminder from Privacy Desk; nothing has been sent to the requester.");
    digests.push({
      email,
      subject: overdue
        ? `Privacy Desk: ${plural(overdue, "legal deadline")} overdue${today ? `, ${today} due today` : ""}`
        : today
          ? `Privacy Desk: ${plural(today, "legal deadline")} due today`
          : `Privacy Desk: ${plural(list.length, "legal deadline")} coming up`,
      text: lines.join("\n"),
      caseIds: [...new Set(list.map((r) => r.case_id))],
      rows: list,
    });
  }
  return digests;
}
