// Reads a saved email (.eml from most mail programs, .msg from Outlook on Windows) into the
// few fields the inbox needs. It runs in the browser, so the file itself and anything attached
// to it never leave the person's computer: only the sender, subject, date and text are sent on.
import MsgReader from "@kenjiuno/msgreader";
import PostalMime from "postal-mime";

export interface ParsedEmail {
  fileName: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  /** When the email arrived, as an ISO timestamp, or null when the file does not say. */
  receivedAt: string | null;
  /** The email's own id, or one worked out from its contents, so a repeat import is recognised. */
  messageId: string;
  /** Set when the text was longer than the inbox keeps and was cut. */
  cut: boolean;
  /** Why this file cannot be imported, in words for the person; null when it can. */
  problem: string | null;
}

/** The most text the database keeps for one inbox item. */
export const MAX_BODY = 50000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isoOrNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fingerprint(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join("\u0001"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `import:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Outlook's own format starts with the compound-file signature; everything else is read as .eml. */
function isMsg(name: string, data: ArrayBuffer): boolean {
  const b = new Uint8Array(data.slice(0, 4));
  return (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) || (/\.msg$/i.test(name) && b[0] === 0xd0);
}

export async function parseEmailFile(fileName: string, data: ArrayBuffer): Promise<ParsedEmail> {
  let fromName = "";
  let fromEmail = "";
  let subject = "";
  let text = "";
  let receivedAt: string | null = null;
  let ownId = "";

  try {
    if (isMsg(fileName, data)) {
      const m = new MsgReader(data).getFileData();
      fromName = m.senderName ?? "";
      // Mail inside one organisation carries an Exchange address, not an email address.
      fromEmail = [m.senderSmtpAddress, m.senderEmail].find((a) => a && EMAIL.test(a.trim())) ?? "";
      subject = m.subject ?? "";
      text = m.body || (m.bodyHtml ? htmlToText(m.bodyHtml) : "");
      receivedAt = isoOrNull(m.messageDeliveryTime) ?? isoOrNull(m.clientSubmitTime) ?? isoOrNull(m.creationTime);
      ownId = m.messageId ?? "";
    } else {
      const m = await PostalMime.parse(data);
      const from = m.from && "address" in m.from ? m.from : undefined;
      fromName = from?.name ?? "";
      fromEmail = from?.address ?? "";
      subject = m.subject ?? "";
      text = m.text || (m.html ? htmlToText(m.html) : "");
      receivedAt = isoOrNull(m.date);
      ownId = m.messageId ?? "";
    }
  } catch {
    return { fileName, fromName: "", fromEmail: "", subject: "", body: "", receivedAt: null, messageId: "", cut: false, problem: "This file could not be read as an email. Save it again as .eml or .msg." };
  }

  const full = tidy(text);
  const cut = full.length > MAX_BODY;
  const body = cut ? full.slice(0, MAX_BODY) : full;
  fromName = fromName.trim();
  fromEmail = fromEmail.trim().toLowerCase();
  subject = subject.trim();
  const nothing = !fromEmail && !subject && !receivedAt;

  return {
    fileName,
    fromName,
    fromEmail: EMAIL.test(fromEmail) ? fromEmail : "",
    subject,
    body,
    receivedAt,
    messageId: ownId.trim() || (await fingerprint([fromEmail, receivedAt ?? "", subject, body])),
    cut,
    // A file with no sender, subject or date is not an email, whatever text it holds.
    problem: nothing ? "This file does not look like an email." : body.length < 10 ? "No text was found in this email." : null,
  };
}
