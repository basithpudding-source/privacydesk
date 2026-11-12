// Turning a letter draft into an email the person can open in their own email program:
// the subject line, the quoted original message underneath, the mailto link, and the list of
// things to complete or double-check before sending. Pure functions, used in the browser and
// tested on their own. Nothing here sends anything: the person presses send themselves.
import { longDate, type ISODate } from "@/lib/clocks";

export type LetterKind = "ack" | "id" | "clarify" | "extend" | "outcome";

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// ---------------------------------------------------------------------------
// Subject line
// ---------------------------------------------------------------------------

const SUBJECT_LEAD: Record<LetterKind, (type: string, isComplaint: boolean) => string> = {
  ack: (t) => `We have received your ${t}`,
  id: (t) => `Proof of identity needed for your ${t}`,
  clarify: (t) => `More detail needed for your ${t}`,
  extend: (t) => `More time needed for your ${t}`,
  outcome: (t, complaint) => (complaint ? `The outcome of your ${t}` : `Our response to your ${t}`),
};

/** One line, no reply/forward prefixes, not too long: safe to put in a subject. */
function cleanSubject(raw: string | null | undefined): string {
  let s = (raw ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  // "RE: Re: FW: hello" -> "hello"
  for (let again = true; again; ) {
    const next = s.replace(/^(re|fw|fwd)\s*:\s*/i, "");
    again = next !== s;
    s = next;
  }
  return s.length > 120 ? `${s.slice(0, 117).trimEnd()}...` : s;
}

/**
 * The subject for a reply. When the person wrote in with a subject of their own, the reply
 * keeps it ("Re: ...") so it threads with their email; otherwise it says what the letter is.
 * The case reference is always there, once.
 */
export function emailSubject(o: { kind: LetterKind; typeLabel: string; ref: string; originalSubject?: string | null; isComplaint: boolean }): string {
  const original = cleanSubject(o.originalSubject);
  if (original) return `Re: ${original.includes(o.ref) ? original : `${original} (reference ${o.ref})`}`;
  return `${SUBJECT_LEAD[o.kind](o.typeLabel.toLowerCase(), o.isComplaint)} (reference ${o.ref})`;
}

// ---------------------------------------------------------------------------
// The original message, quoted under the reply
// ---------------------------------------------------------------------------

export interface OriginalMessage {
  fromName: string | null;
  fromEmail: string | null;
  /** The day it arrived. */
  sentOn: ISODate;
  subject: string | null;
  body: string;
}

/** The person's own message as it would sit under a reply: a short header, then their words quoted. */
export function quotedOriginal(o: OriginalMessage): string {
  const from = o.fromName && o.fromEmail ? `${o.fromName} <${o.fromEmail}>` : (o.fromName ?? o.fromEmail ?? "Unknown sender");
  const head = ["-----Original message-----", `From: ${from}`, `Sent: ${longDate(o.sentOn)}`];
  const subject = cleanSubjectKeepPrefix(o.subject);
  if (subject) head.push(`Subject: ${subject}`);
  const body = o.body
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return `${head.join("\n")}\n\n${body}`;
}

function cleanSubjectKeepPrefix(raw: string | null): string {
  return (raw ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The whole email text: the reply, then (if wanted) the original message beneath it. */
export function composeEmailBody(draft: string, original: OriginalMessage | null): string {
  const reply = draft.replace(/\r\n?/g, "\n").trimEnd();
  return original ? `${reply}\n\n\n${quotedOriginal(original)}` : reply;
}

// ---------------------------------------------------------------------------
// Opening the person's email program
// ---------------------------------------------------------------------------

/**
 * Email links have no agreed length limit, but on Windows a browser refuses to hand over a
 * link much beyond 2,000 characters, and nothing happens when it is clicked. Other systems
 * take far longer ones. These are the lengths the app stays within.
 */
export const MAILTO_LIMIT_WINDOWS = 2000;
export const MAILTO_LIMIT_OTHER = 7000;

export function mailtoLimit(userAgent: string): number {
  return /Windows/i.test(userAgent) ? MAILTO_LIMIT_WINDOWS : MAILTO_LIMIT_OTHER;
}

/** Percent-encode a value for an email link, leaving the few marks that are safe as they are (shorter links). */
function encodeValue(value: string): string {
  return encodeURIComponent(value).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%3B/g, ";");
}

export function mailtoHref(to: string, subject: string, body: string): string {
  const address = EMAIL.test(to.trim()) ? encodeURIComponent(to.trim()).replace(/%40/g, "@") : "";
  const parts = [`subject=${encodeValue(subject.replace(/[\r\n]+/g, " ").trim())}`];
  // Line breaks in an email link must be CR LF.
  if (body) parts.push(`body=${encodeValue(body.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n"))}`);
  return `mailto:${address}?${parts.join("&")}`;
}

export interface EmailLaunch {
  href: string;
  /** What the link itself carries: everything, the reply without the original, or only recipient and subject. */
  carried: "all" | "reply" | "none";
  /** What did not fit and should go on the clipboard for the person to paste; null when everything fitted. */
  clipboard: string | null;
}

/**
 * The link to open, within the length the person's system accepts. It carries as much as
 * fits, in this order: the whole email; the reply without the quoted original; the recipient
 * and subject alone. Whatever was left out is returned for the clipboard.
 */
export function emailLaunch(o: { to: string; subject: string; reply: string; original: OriginalMessage | null; limit: number }): EmailLaunch {
  const all = composeEmailBody(o.reply, o.original);
  const full = mailtoHref(o.to, o.subject, all);
  if (full.length <= o.limit) return { href: full, carried: "all", clipboard: null };
  if (o.original) {
    const replyOnly = mailtoHref(o.to, o.subject, composeEmailBody(o.reply, null));
    if (replyOnly.length <= o.limit) return { href: replyOnly, carried: "reply", clipboard: quotedOriginal(o.original) };
  }
  return { href: mailtoHref(o.to, o.subject, ""), carried: "none", clipboard: all };
}

// ---------------------------------------------------------------------------
// What to complete or double-check before sending
// ---------------------------------------------------------------------------

export interface KnownDate {
  date: ISODate;
  /** What the date is on this case, in a few words: "received", "legal deadline". */
  label: string;
}

export interface Flag {
  start: number;
  end: number;
  text: string;
  /** "fill": a gap the person must complete. "check": something that may be wrong. */
  level: "fill" | "check";
  message: string;
}

export interface DraftChecks {
  /** In the order they appear in the draft; never overlapping. */
  flags: Flag[];
  /** Dates in the draft that are dates of this case, for reassurance. */
  matched: { text: string; label: string }[];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_DATE = new RegExp(
  `\\b(?:(${WEEKDAYS.join("|")}),?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})\\s+(\\d{4})\\b`,
  "gi",
);
const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const GAP = /\[[^\[\]\n]{1,160}\]/g;
const TITLE_IN_GREETING = /^\s*Dear\s+(Mr|Mrs|Ms|Miss|Mx|Dr)\b\.?/i;

function isoOf(year: number, month: number, day: number): { iso: ISODate; weekday: string } | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, weekday: WEEKDAYS[d.getUTCDay()] };
}

/**
 * Read a draft for things the sender should look at: gaps left in [square brackets], dates
 * that are not dates of this case (or whose weekday is wrong), a reference that is nearly but
 * not quite this case's, and a title such as "Ms" that the case never gave. This checks an AI
 * draft against the facts the app already holds; it does not judge the wording.
 */
export function findFlags(text: string, o: { knownDates: KnownDate[]; refs: string[]; requesterName: string | null }): DraftChecks {
  const flags: Flag[] = [];
  const matched: DraftChecks["matched"] = [];
  const taken = (start: number, end: number) => flags.some((f) => start < f.end && end > f.start);
  const known = new Map(o.knownDates.map((k) => [k.date, k.label]));

  for (const m of text.matchAll(GAP)) {
    flags.push({ start: m.index, end: m.index + m[0].length, text: m[0], level: "fill", message: `Fill in ${m[0]}` });
  }

  const date = (m: RegExpMatchArray, year: number, month: number, day: number, saidWeekday: string | null) => {
    const start = m.index as number;
    const end = start + m[0].length;
    if (taken(start, end)) return;
    const real = isoOf(year, month, day);
    if (!real) {
      flags.push({ start, end, text: m[0], level: "check", message: `“${m[0]}” is not a real date` });
    } else if (saidWeekday && saidWeekday.toLowerCase() !== real.weekday.toLowerCase()) {
      flags.push({ start, end, text: m[0], level: "check", message: `“${m[0]}”: that date is a ${real.weekday}` });
    } else if (!known.has(real.iso)) {
      flags.push({ start, end, text: m[0], level: "check", message: `“${m[0]}” is not one of this case's dates. Check it` });
    } else if (!matched.some((x) => x.text === m[0])) {
      matched.push({ text: m[0], label: known.get(real.iso) as string });
    }
  };
  for (const m of text.matchAll(LONG_DATE)) date(m, Number(m[4]), MONTHS.indexOf(m[3].toLowerCase()) + 1, Number(m[2]), m[1] ?? null);
  for (const m of text.matchAll(NUMERIC_DATE)) date(m, Number(m[3]), Number(m[2]), Number(m[1]), null);

  // A reference that starts like this case's but is not it: most likely a slip.
  const prefix = o.refs[0]?.split("-")[0];
  if (prefix) {
    const like = new RegExp(`\\b${prefix.replace(/[^A-Za-z0-9]/g, "")}-[A-Z]?\\d{2,6}\\b`, "g");
    for (const m of text.matchAll(like)) {
      const start = m.index;
      const end = start + m[0].length;
      if (!o.refs.includes(m[0]) && !taken(start, end)) {
        flags.push({ start, end, text: m[0], level: "check", message: `“${m[0]}” is not this case's reference (${o.refs[0]})` });
      }
    }
  }

  // "Dear Ms Marsh" when the case only says "Helen Marsh": the title is a guess.
  const title = TITLE_IN_GREETING.exec(text);
  if (title && !new RegExp(`\\b${title[1]}\\b`, "i").test(o.requesterName ?? "")) {
    const start = title.index + title[0].toLowerCase().indexOf(title[1].toLowerCase());
    const end = start + title[1].length;
    if (!taken(start, end)) {
      flags.push({ start, end, text: title[1], level: "check", message: `“${title[1]}” is a guess: the case does not say how this person is addressed` });
    }
  }

  flags.sort((a, b) => a.start - b.start);
  return { flags, matched };
}

/** The draft cut into plain and flagged runs, for drawing the highlights behind the text. */
export function highlightSegments(text: string, flags: Flag[]): { text: string; flag: number | null }[] {
  const out: { text: string; flag: number | null }[] = [];
  let at = 0;
  flags.forEach((f, i) => {
    if (f.start > at) out.push({ text: text.slice(at, f.start), flag: null });
    out.push({ text: text.slice(f.start, f.end), flag: i });
    at = f.end;
  });
  if (at < text.length) out.push({ text: text.slice(at), flag: null });
  return out;
}
