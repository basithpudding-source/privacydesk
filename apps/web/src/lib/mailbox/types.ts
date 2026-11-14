// A person's own mailbox, connected from their browser. Privacy Desk cannot show an email
// program inside the page, so it talks to the mailbox itself: it lists what is in the inbox
// for the person to choose from, and it writes and sends a reply when the person presses Send.
//
// Everything here runs in the browser. The permission to use the mailbox is granted by the
// person to their own browser and is never sent to Privacy Desk's server; the server only
// ever receives the emails the person chooses to import, and the short record of what was sent.

export interface MailboxAccount {
  address: string;
  name: string | null;
  /** The made-up mailbox used to try the screens before a real one is set up. Nothing is really sent from it. */
  sample: boolean;
}

/** One email in the inbox list: enough to recognise it, not its full text. */
export interface MailboxMessage {
  id: string;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  /** ISO date and time it arrived. */
  receivedAt: string;
  /** The first line or two, as the mailbox itself previews it. */
  preview: string;
  hasAttachments: boolean;
}

export interface ReplyAttachment {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

export interface ReplyInput {
  to: string[];
  subject: string;
  /** Plain text: the reply, with the person's original message underneath when that was asked for. */
  body: string;
  /** The Message-ID of the email being answered, so the reply joins its conversation. Null when the case did not come from an email. */
  inReplyTo: string | null;
  attachments: ReplyAttachment[];
}

export interface DraftRef {
  id: string;
  /** Opens the draft in Outlook on the web, when the mailbox gives one. */
  webLink: string | null;
  /** Whether it was made as a reply to the original email (and so sits in the same conversation). */
  threaded: boolean;
}

export type DraftStatus =
  | { state: "draft" }
  /** Deleted, or no longer where it was. */
  | { state: "gone" }
  | { state: "sent"; sentAt: string; to: string[]; subject: string; attachments: string[] };

export interface Mailbox {
  readonly account: MailboxAccount;
  /** Emails in the inbox that arrived in a period, newest first. `next` continues a longer list. */
  listInbox(range: { since: string; until?: string | null }, next?: string | null): Promise<{ messages: MailboxMessage[]; next: string | null }>;
  /** One email exactly as it was delivered, in the format saved .eml files use. */
  mime(id: string): Promise<ArrayBuffer>;
  /** Put a reply in the mailbox's Drafts. Nothing is sent. */
  saveDraft(input: ReplyInput): Promise<DraftRef>;
  /** Send a draft made by saveDraft. Only ever called when the person presses Send. */
  send(draftId: string): Promise<void>;
  /** Whether a draft is still a draft, has been sent, or has gone. */
  status(draftId: string): Promise<DraftStatus>;
}

export type MailboxProblem = "sign-in" | "permission" | "not-found" | "busy" | "blocked" | "cancelled" | "other";

/** A failure the person can act on: `message` says what happened and what to do. */
export class MailboxError extends Error {
  constructor(
    message: string,
    readonly problem: MailboxProblem,
  ) {
    super(message);
    this.name = "MailboxError";
  }
}

/** Files bigger than this cannot be attached from the app: the mailbox's simple attach limit is 3 MB. */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024 - 64 * 1024;
export const MAX_ATTACHMENTS = 10;

/** Split what was typed in "To" into addresses; anything that is not an address is dropped. */
export function splitRecipients(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[;,\s]+/)) {
    const a = part.trim().replace(/^<|>$/g, "").toLowerCase();
    if (/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(a)) seen.add(a);
  }
  return [...seen];
}

/** A Message-ID as mail servers write it, in angle brackets; null for anything that is not one (such as a made-up fingerprint). */
export function asMessageId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim().replace(/^<|>$/g, "");
  return /^[^\s<>@]+@[^\s<>@]+$/.test(id) ? `<${id}>` : null;
}
