// A reply that has left the letters box but is not finished with: saved to the mailbox's
// Drafts and not yet known to be sent, or sent but not yet recorded on the case. It is kept
// in this browser (one per case) so that reloading the page, or coming back after sending
// from Outlook, does not lose track of it. Nothing of the email's text is kept, only the
// facts the audit trail will record.
import { checkRecipient, evidenceLine, sentWhen } from "@/lib/cases/evidence";
import type { CaseAction } from "@/lib/cases/types";
import { londonDate } from "@/lib/today";

export interface PendingLetter {
  /** "draft": in the mailbox's Drafts. "sent": gone, and still to be recorded on the case. */
  state: "draft" | "sent";
  draftId: string;
  webLink: string | null;
  mailbox: string;
  /** From the made-up mailbox: nothing was really sent. */
  sample: boolean;
  savedAt: string;
  sentAt: string | null;
  to: string[];
  subject: string;
  attachments: string[];
  /** One or two sentences on what the reply said, for the audit trail. */
  summary: string;
  /** Which letter it was, as the letters box names it. */
  letter: string;
  /** The step to record once it has gone; null when the case has no such step open. */
  action: CaseAction | null;
  stepLabel: string | null;
}

const key = (caseId: string) => `pd_mail_pending:${caseId}`;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : []);

/** Whatever was stored is checked again before it is used: it sat in the browser, where anything can be changed. */
export function parsePending(raw: string | null): PendingLetter | null {
  try {
    const o = JSON.parse(raw ?? "null") as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || !text(o.draftId, 400)) return null;
    return {
      state: o.state === "sent" ? "sent" : "draft",
      draftId: text(o.draftId, 400),
      webLink: text(o.webLink, 600) || null,
      mailbox: text(o.mailbox, 254),
      sample: o.sample === true,
      savedAt: text(o.savedAt, 40),
      sentAt: text(o.sentAt, 40) || null,
      to: list(o.to),
      subject: text(o.subject, 300),
      attachments: list(o.attachments),
      summary: text(o.summary, 400),
      letter: text(o.letter, 60),
      action: text(o.action, 20) ? (text(o.action, 20) as CaseAction) : null,
      stepLabel: text(o.stepLabel, 80) || null,
    };
  } catch {
    return null;
  }
}

export function readPending(caseId: string): PendingLetter | null {
  try {
    return parsePending(localStorage.getItem(key(caseId)));
  } catch {
    return null;
  }
}

export function writePending(caseId: string, p: PendingLetter | null) {
  try {
    if (p) localStorage.setItem(key(caseId), JSON.stringify(p));
    else localStorage.removeItem(key(caseId));
  } catch {
    // Without storage the reply is simply not remembered across a reload.
  }
}

/** What else a step must be told before it can be recorded: a note, an outcome, or nothing. */
export function stepNeeds(action: CaseAction | null, isComplaint: boolean): { note: string | null; outcome: boolean; closes: boolean } {
  return {
    note: action === "pause" ? "What you asked them to clarify" : action === "extend" ? "Why the request is complex" : null,
    outcome: action === "close" && isComplaint,
    closes: action === "close",
  };
}

export interface SentRecord {
  /** The step to record; null records a note instead. */
  action: CaseAction | null;
  /** The London day it was sent. */
  on: string;
  note: string;
  outcome: string;
  /** The short record that goes on the step's audit entry. */
  evidence: string;
  /** The whole entry when there is no step to hang the record on. */
  fallbackNote: string;
}

/** What goes on the audit trail for a reply that has been sent. */
export function sentRecord(p: PendingLetter, requesterEmail: string | null, extra: { note: string; outcome: string }): SentRecord {
  const sentAt = p.sentAt ?? p.savedAt;
  const recipient = checkRecipient({ from: { name: "", email: p.mailbox }, to: p.to.map((email) => ({ name: "", email })), cc: [] }, requesterEmail);
  const via = p.sample ? `${p.mailbox}, a sample mailbox, so nothing was really sent` : p.mailbox;
  const evidence = evidenceLine({ sentAt, recipient, subject: p.subject, attachments: p.attachments, summary: p.summary, via });
  return {
    action: p.action,
    on: londonDate(sentAt),
    note: extra.note.trim(),
    outcome: extra.outcome.trim(),
    evidence,
    fallbackNote: `${p.letter || "An"} email sent ${sentWhen(sentAt).words} ${recipient.words}, from Privacy Desk through ${via}. Subject: “${p.subject}”.`.slice(0, 1900),
  };
}
