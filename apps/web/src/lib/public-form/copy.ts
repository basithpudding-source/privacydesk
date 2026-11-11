// Words for the public form and its confirmation. Plain English, no legal terms, UK spelling.
import { addDays, addMonthsClamped, BANK_HOLIDAYS_ENGLAND_WALES, longDate, nextWorkingDay, type ISODate, type Region } from "@/lib/clocks";

export type RequestKind = "sar" | "complaint" | "other";

export const REQUEST_KINDS: { value: RequestKind; label: string; hint: string }[] = [
  { value: "sar", label: "A copy of the personal information you hold about me", hint: "Also called a subject access request." },
  { value: "complaint", label: "A complaint about how my personal information was handled", hint: "For example it was shared, lost or kept when it should not have been." },
  { value: "other", label: "Something else about my personal information", hint: "For example correcting it, deleting it, or stopping its use." },
];

export function requestKindLabel(kind: RequestKind): string {
  return REQUEST_KINDS.find((k) => k.value === kind)?.label ?? "A request about my personal information";
}

/**
 * The holidays the engine ships with, as a fallback when the database has none for a region.
 * The nightly job (slice 6) loads all three regions from GOV.UK into pd.bank_holidays.
 */
export function holidaysFor(region: Region): ReadonlySet<ISODate> {
  return new Set(region === "england-and-wales" ? BANK_HOLIDAYS_ENGLAND_WALES : []);
}

export interface ResponseDates {
  /** The legal date, as the organisation's clock would work it out with no pauses. */
  due: ISODate;
  /** One sentence for the requester. */
  sentence: string;
}

/**
 * What to tell the requester about timing. For a copy of their data or any other rights request:
 * one calendar month from the day the request was complete, moved to the next working day
 * (ICO guidance). For a complaint: the organisation acknowledges within 30 days and responds
 * without undue delay. If identity has to be checked first, the organisation's clock starts
 * later; the confirmation says so separately.
 */
export function responseDates(kind: RequestKind, receivedOn: ISODate, region: Region, loaded?: ReadonlySet<ISODate>): ResponseDates {
  const holidays = loaded && loaded.size > 0 ? loaded : holidaysFor(region);
  if (kind === "complaint") {
    const due = nextWorkingDay(addDays(receivedOn, 30), holidays);
    return { due, sentence: `They will acknowledge your complaint by ${longDate(due)} and respond without undue delay.` };
  }
  const due = nextWorkingDay(addMonthsClamped(receivedOn, 1), holidays);
  return { due, sentence: `They should respond by ${longDate(due)}, one calendar month from today.` };
}

export interface ConfirmationInput {
  ref: string;
  kind: RequestKind;
  receivedOn: ISODate;
  region: Region;
  organisationName: string;
  requesterName: string;
  contactEmail: string | null;
  /** Bank holidays for the region from the database, when loaded. */
  holidays?: ReadonlySet<ISODate>;
}

/** The confirmation email, as plain text. The page shows the same facts. */
export function confirmationEmail(c: ConfirmationInput): { subject: string; text: string } {
  const { sentence } = responseDates(c.kind, c.receivedOn, c.region, c.holidays);
  const contact = c.contactEmail
    ? `If you have a question, email ${c.contactEmail} and quote your reference.`
    : `If you have a question, contact ${c.organisationName} and quote your reference.`;
  return {
    subject: `Your request to ${c.organisationName}: reference ${c.ref}`,
    text: [
      `Dear ${c.requesterName},`,
      ``,
      `Thank you for confirming your email address. ${c.organisationName} has received your request.`,
      ``,
      `Your reference: ${c.ref}`,
      `Received: ${longDate(c.receivedOn)}`,
      `What you asked for: ${requestKindLabel(c.kind)}`,
      ``,
      sentence,
      `If they need to check who you are first, the time runs from when they receive that proof; they will tell you if so.`,
      ``,
      contact,
      ``,
      `Please keep this email. Your request will be handled by ${c.organisationName}; this message was sent by Privacy Desk, the software they use to manage requests.`,
    ].join("\n"),
  };
}

/** The verification email, as plain text. */
export function verificationEmail(organisationName: string, requesterName: string, link: string): { subject: string; text: string } {
  return {
    subject: `Confirm your email address to send your request to ${organisationName}`,
    text: [
      `Dear ${requesterName},`,
      ``,
      `You filled in ${organisationName}'s request form. To send the request, open the link below and press the button on the page. This confirms the email address is yours. The link works for 24 hours.`,
      ``,
      link,
      ``,
      `If you did not fill in the form, ignore this email. Nothing is sent unless the button is pressed.`,
      ``,
      `This message was sent by Privacy Desk, the software ${organisationName} uses to manage requests.`,
    ].join("\n"),
  };
}

/** Black or white text, whichever reads better on a client's colour (WCAG relative luminance). */
export function readableOn(hex: string): "#000000" | "#ffffff" {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#ffffff";
  const lin = (c: string) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  // Contrast with white is (1.05 / (l + 0.05)); with black (l + 0.05) / 0.05. Pick the larger.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#000000";
}
