// Reminder digests: one email per person per night listing their cases due in 7 days,
// 2 days and today. Internal mail to the consultancy's own staff, never to requesters.
import { longDate, type ISODate } from "@/lib/clocks";

/** One row of pd.reminders_due(). */
export interface ReminderRow {
  case_id: string;
  ref: string;
  type: string;
  clock_state: string;
  due_on: ISODate;
  bucket: 7 | 2 | 0;
  organisation_id: string;
  organisation_name: string;
  partner_id: string;
  partner_name: string;
  user_id: string;
  email: string;
}

export interface Digest {
  email: string;
  subject: string;
  text: string;
  caseIds: string[];
}

const TYPE: Record<string, string> = {
  complaint: "complaint (acknowledgement due)",
  sar: "subject access request",
  erasure: "erasure request",
  rectification: "rectification request",
  objection: "objection",
};

function bucketHeading(b: 7 | 2 | 0): string {
  return b === 0 ? "Due today" : b === 2 ? "Due in 2 days" : "Due in 7 days";
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
    lines.push(`Legal deadlines for ${partner}'s clients: ${list.length} case${list.length === 1 ? "" : "s"}${today ? `, ${today} due today` : ""}.`);
    for (const b of [0, 2, 7] as const) {
      const group = list.filter((r) => r.bucket === b);
      if (!group.length) continue;
      lines.push("");
      lines.push(bucketHeading(b));
      for (const r of group) {
        lines.push(`- ${r.ref}, ${TYPE[r.type] ?? r.type}, ${r.organisation_name}: ${longDate(r.due_on)}. ${appUrl}/cases/${r.case_id}`);
      }
    }
    lines.push("");
    lines.push("Dates follow ICO guidance. This is an automatic reminder from Privacy Desk; nothing has been sent to the requester.");
    digests.push({
      email,
      subject: today ? `Privacy Desk: ${today} legal deadline${today === 1 ? "" : "s"} due today` : `Privacy Desk: ${list.length} legal deadline${list.length === 1 ? "" : "s"} coming up`,
      text: lines.join("\n"),
      caseIds: [...new Set(list.map((r) => r.case_id))],
    });
  }
  return digests;
}
