// What the app keeps from a sent email when it is dropped onto a step: not the email, but a
// short line of evidence. When it was sent, who it went to and whether that is the person on
// the case, the subject, what was attached, and a one-line summary. Pure functions, used in
// the browser and tested on their own.
import { shortDate, type ISODate } from "@/lib/clocks";
import type { Party, SentEmail } from "@/lib/inbox/parse-email";
import { londonDate } from "@/lib/today";
import type { CaseAction } from "./types";

/** The steps that mean an email went to the person, so a sent email can stand behind them. */
export const EMAIL_STEPS: CaseAction[] = ["acknowledge", "ask_id", "pause", "extend", "close"];

export type Verdict = "ok" | "warn" | "danger" | "info";

export interface Finding {
  verdict: Verdict;
  /** A sentence for the screen. */
  message: string;
}

export interface RecipientCheck extends Finding {
  /** How the evidence line says who it went to. */
  words: string;
  /** True when the email cannot be evidence at all (it is the person's own email, not a reply to them). */
  unusable?: boolean;
}

const list = (people: Party[]) => people.map((p) => p.email || p.name).filter(Boolean);

/**
 * Was this email sent to the person on the case? The answer is the most important thing the
 * evidence shows, so every case is spelled out: sent to them, only copied to them, sent to
 * someone else, sent BY them (the wrong email was dropped), or impossible to tell.
 */
export function checkRecipient(email: Pick<SentEmail, "from" | "to" | "cc">, requesterEmail: string | null): RecipientCheck {
  const requester = (requesterEmail ?? "").trim().toLowerCase();
  const to = list(email.to);
  const everyone = [...to, ...list(email.cc)];
  const toWords = to.length ? to.join(", ") : everyone.length ? everyone.join(", ") : "an unknown recipient";
  const unreadable = [...email.to, ...email.cc].length > 0 && [...email.to, ...email.cc].every((p) => !p.email);

  if (requester && email.from.email === requester && !email.to.some((p) => p.email === requester)) {
    return {
      verdict: "danger",
      message: `This looks like the email from the person (${requester}), not the one you sent to them. Drop the email from your Sent folder.`,
      words: `to ${toWords}; note: this email was sent by the person on the case (${requester}), not to them`,
      unusable: true,
    };
  }
  if (unreadable) {
    return {
      verdict: "warn",
      message: `The addresses could not be read from this file, only the names (${toWords}). Check yourself that it went to the person on the case${requester ? ` (${requester})` : ""}.`,
      words: `to ${toWords} (addresses could not be read from the file)`,
    };
  }
  if (!requester) {
    return { verdict: "info", message: `The case has no email address for the person, so there is nothing to compare. It was sent to ${toWords}.`, words: `to ${toWords}; the case has no address to compare` };
  }
  if (email.to.some((p) => p.email === requester)) {
    return { verdict: "ok", message: `Sent to the person on the case (${requester}).`, words: `to ${requester}, the address on the case` };
  }
  if (email.cc.some((p) => p.email === requester)) {
    return {
      verdict: "warn",
      message: `The person on the case (${requester}) was only copied in. The email was addressed to ${toWords}.`,
      words: `to ${toWords}; the person on the case (${requester}) was copied in`,
    };
  }
  return {
    verdict: "danger",
    message: `Not sent to the address on the case. The case has ${requester}; this email went to ${toWords}.`,
    words: `to ${toWords}, which is not the address on the case (${requester})`,
  };
}

/** The day (in London) and the words for when an email was sent: "12 Nov 2026 at 14:32". */
export function sentWhen(iso: string): { date: ISODate; words: string } {
  const date = londonDate(iso);
  const time = new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false });
  return { date, words: `${shortDate(date)} at ${time}` };
}

/** Whether the sent date can stand as the date of the step. Null when it can. */
export function checkSentDate(sentAt: string | null, receivedOn: ISODate, today: ISODate): Finding | null {
  if (!sentAt) return { verdict: "warn", message: "This file does not say when the email was sent. Set the date yourself." };
  const { date } = sentWhen(sentAt);
  if (date > today) return { verdict: "danger", message: `This email is dated ${shortDate(date)}, which is in the future. Check the date and set it yourself.` };
  if (date < receivedOn) return { verdict: "danger", message: `This email was sent on ${shortDate(date)}, before the case was received (${shortDate(receivedOn)}). It may belong to another case.` };
  return null;
}

const GREETING = /^\s*(dear|hi|hello|good (morning|afternoon|evening))\b[^\n]*\n/i;
const SIGN_OFF = /^\s*(yours (sincerely|faithfully)|kind regards|best regards|warm regards|regards|best wishes|many thanks|thanks|thank you)[,.!]?\s*$/im;

/**
 * A summary without AI: the first sentence or two of what was written, without the greeting
 * or the sign-off, kept short. Used when AI is off for the client, and until the AI answers.
 */
export function plainSummary(replyText: string, max = 240): string {
  let text = replyText.replace(/\r\n?/g, "\n").replace(GREETING, "");
  const end = text.search(SIGN_OFF);
  if (end >= 0) text = text.slice(0, end);
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  // Two sentences at most, and fewer if two would run long.
  let out = "";
  for (const s of sentences.slice(0, 2)) {
    if (out && (out + s).length > max) break;
    out += s;
  }
  out = out.trim();
  return out.length > max ? `${out.slice(0, max - 3).trimEnd()}...` : out;
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);

/**
 * The line that goes on the audit trail with the step. It records facts about the email and a
 * short summary; it is not a copy of the email. Kept well inside the database's limit.
 */
export function evidenceLine(o: { sentAt: string | null; recipient: RecipientCheck; subject: string; attachments: string[]; summary: string | null }): string {
  const parts = [`Email evidence: sent ${o.sentAt ? sentWhen(o.sentAt).words : "on a date the file does not give"} ${o.recipient.words}.`];
  const subject = o.subject.replace(/\s+/g, " ").trim();
  if (subject) parts.push(`Subject: “${short(subject, 150)}”.`);
  const names = o.attachments.map((a) => short(a.replace(/\s+/g, " ").trim(), 80)).filter(Boolean);
  if (names.length === 0) parts.push("No attachments.");
  else parts.push(`${names.length === 1 ? "Attachment" : `${names.length} attachments`}: ${names.slice(0, 8).join(", ")}${names.length > 8 ? `, and ${names.length - 8} more` : ""}.`);
  const summary = (o.summary ?? "").replace(/\s+/g, " ").trim();
  if (summary) parts.push(`Summary: ${short(summary, 400)}`);
  return short(parts.join(" "), 1400);
}
