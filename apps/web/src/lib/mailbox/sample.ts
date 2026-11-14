// A made-up mailbox, for trying the mailbox screens in development before a real one is set
// up, and for checking them without real personal data. It holds a handful of invented emails
// and pretends to keep drafts and to send; nothing ever leaves the browser. It is never used
// in production (see mailboxMode in connect.ts).
import { MailboxError, type DraftRef, type DraftStatus, type Mailbox, type MailboxMessage, type ReplyInput } from "./types";

export const SAMPLE_ADDRESS = "sample.mailbox@example.com";

interface SampleEmail {
  id: string;
  hoursAgo: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  attachment?: string;
}

const EMAILS: SampleEmail[] = [
  { id: "s1", hoursAgo: 2, fromName: "Rosa Vega (sample)", fromEmail: "rosa.vega@example.com", subject: "Copy of my records please", body: "Sample data.\n\nPlease send me a copy of all the personal data you hold about me, including any notes of my phone calls.\n\nRosa Vega" },
  { id: "s2", hoursAgo: 6, fromName: "Imran Shah (sample)", fromEmail: "imran.shah@example.com", subject: "Complaint: letter sent to my old address", body: "Sample data.\n\nYou sent a letter about my account to an address I left two years ago. I want to complain about how my details were handled.\n\nImran Shah" },
  { id: "s3", hoursAgo: 20, fromName: "Newsletter (sample)", fromEmail: "news@example.org", subject: "This month's training dates", body: "Sample data.\n\nOur autumn training dates are now open for booking.", attachment: "Training dates.pdf" },
  { id: "s4", hoursAgo: 30, fromName: "Leah Novak (sample)", fromEmail: "leah.novak@example.com", subject: "Please delete my account", body: "Sample data.\n\nI no longer use your service. Please delete my account and everything you hold about me.\n\nLeah Novak" },
  { id: "s5", hoursAgo: 4 * 24, fromName: "Omar Haddad (sample)", fromEmail: "omar.haddad@example.com", subject: "Wrong date of birth on my file", body: "Sample data.\n\nMy date of birth is wrong on your records. Please correct it.\n\nOmar Haddad" },
  { id: "s6", hoursAgo: 12 * 24, fromName: "Priya Nair (sample)", fromEmail: "priya.nair@example.com", subject: "Stop the marketing texts", body: "Sample data.\n\nI have asked twice for the marketing texts to stop. Please stop them.\n\nPriya Nair" },
];

const received = (e: SampleEmail, now: number) => new Date(now - e.hoursAgo * 3_600_000);

/** The email as a mail server would deliver it, so it goes through the same reader as a saved file. */
export function sampleMime(e: SampleEmail, now = Date.now()): string {
  return [
    `From: ${e.fromName} <${e.fromEmail}>`,
    `To: Sample Mailbox <${SAMPLE_ADDRESS}>`,
    `Subject: ${e.subject}`,
    `Date: ${received(e, now).toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${e.id}-sample@example.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    e.body,
    "",
  ].join("\r\n");
}

interface StoredDraft {
  id: string;
  to: string[];
  subject: string;
  attachments: string[];
  sentAt: string | null;
}

const KEY = "pd_sample_mailbox_drafts";

function drafts(): StoredDraft[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as StoredDraft[]) : [];
  } catch {
    return [];
  }
}

function keep(list: StoredDraft[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list.slice(-20)));
  } catch {
    // Without storage the sample simply forgets its drafts when the page reloads.
  }
}

/** A short wait, so the screens show their "working" state as they would with a real mailbox. */
const pause = () => new Promise((r) => setTimeout(r, 350));

export function sampleMailbox(): Mailbox {
  return {
    account: { address: SAMPLE_ADDRESS, name: "Sample mailbox", sample: true },

    async listInbox(range) {
      await pause();
      const now = Date.now();
      const since = new Date(range.since).getTime();
      const until = range.until ? new Date(range.until).getTime() : now;
      const messages: MailboxMessage[] = EMAILS.filter((e) => {
        const t = received(e, now).getTime();
        return t >= since && t <= until;
      }).map((e) => ({
        id: e.id,
        subject: e.subject,
        fromName: e.fromName,
        fromEmail: e.fromEmail,
        receivedAt: received(e, now).toISOString(),
        preview: e.body.replace(/\s+/g, " ").slice(0, 140),
        hasAttachments: Boolean(e.attachment),
      }));
      return { messages, next: null };
    },

    async mime(id) {
      await pause();
      const e = EMAILS.find((x) => x.id === id);
      if (!e) throw new MailboxError("That email is no longer in the mailbox.", "not-found");
      return new TextEncoder().encode(sampleMime(e)).buffer as ArrayBuffer;
    },

    async saveDraft(input: ReplyInput): Promise<DraftRef> {
      await pause();
      const id = `d${Date.now().toString(36)}`;
      keep([...drafts(), { id, to: input.to, subject: input.subject, attachments: input.attachments.map((a) => a.name), sentAt: null }]);
      return { id, webLink: null, threaded: Boolean(input.inReplyTo) };
    },

    async send(draftId) {
      await pause();
      const list = drafts();
      const d = list.find((x) => x.id === draftId);
      if (!d) throw new MailboxError("That draft is no longer in the mailbox.", "not-found");
      d.sentAt = new Date().toISOString();
      keep(list);
    },

    async status(draftId): Promise<DraftStatus> {
      await pause();
      const d = drafts().find((x) => x.id === draftId);
      if (!d) return { state: "gone" };
      return d.sentAt ? { state: "sent", sentAt: d.sentAt, to: d.to, subject: d.subject, attachments: d.attachments } : { state: "draft" };
    },
  };
}
