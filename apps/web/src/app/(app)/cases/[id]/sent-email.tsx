"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CircleCheck, FileUp, Info, Paperclip, X } from "lucide-react";
import { checkRecipient, checkSentDate, evidenceLine, plainSummary, sentWhen, type Finding, type RecipientCheck, type Verdict } from "@/lib/cases/evidence";
import type { SentEmail } from "@/lib/inbox/parse-email";
import { cn } from "@/lib/utils";
import { summariseSent } from "./actions";

/** Bigger than this is nearly always attachments; only the text and the names are read. */
const MAX_FILE_BYTES = 30 * 1024 * 1024;

export interface SentEvidence {
  email: SentEmail;
  recipient: RecipientCheck;
  /** A problem with using the sent date as the date of the step; null when it can be used. */
  dateProblem: Finding | null;
  /** The London day the email was sent, when the file gives one. */
  sentOn: string | null;
}

/**
 * Reads a sent email dropped onto a step and keeps what matters about it. The file is read
 * in the browser and is never uploaded: the app keeps when it was sent, who it went to, the
 * subject, the attachment names and a short summary, on the audit trail with the step.
 */
export function useSentEmail(o: { caseId: string; requesterEmail: string | null; receivedOn: string; today: string; onRead: (e: SentEvidence, summary: string) => void; onSummary: (summary: string) => void }) {
  const [evidence, setEvidence] = useState<SentEvidence | null>(null);
  const [summary, setSummary] = useState("");
  const [summaryBy, setSummaryBy] = useState<"plain" | "ai" | "you">("plain");
  const [summaryNote, setSummaryNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  // Which read is current, so a slow AI answer for a removed email is ignored.
  const turn = useRef(0);
  // Who wrote the summary as it stands, readable from inside a finished request.
  const by = useRef<"plain" | "ai" | "you">("plain");
  const writtenBy = (): "plain" | "ai" | "you" => by.current;

  async function take(files: File[]) {
    setError(null);
    const file = files[0];
    if (!file) return;
    if (files.length > 1) setError("One email at a time: the first one was read.");
    if (file.size > MAX_FILE_BYTES) {
      setError(`${file.name} is over 30 MB. Save the email without its attachments and try again.`);
      return;
    }
    const mine = ++turn.current;
    setReading(true);
    // The parsers are only fetched when someone actually drops an email.
    const { parseSentEmail } = await import("@/lib/inbox/parse-email");
    const email = await parseSentEmail(file.name, await file.arrayBuffer());
    setReading(false);
    if (mine !== turn.current) return;
    if (email.problem) {
      setError(email.problem);
      return;
    }
    const recipient = checkRecipient(email, o.requesterEmail);
    if (recipient.unusable) {
      // The person's own email is not evidence of anything sent to them: nothing is taken from it.
      setEvidence(null);
      setError(recipient.message);
      return;
    }
    const found: SentEvidence = {
      email,
      recipient,
      dateProblem: checkSentDate(email.sentAt, o.receivedOn, o.today),
      sentOn: email.sentAt ? sentWhen(email.sentAt).date : null,
    };
    const plain = plainSummary(email.replyText);
    setEvidence(found);
    setSummary(plain);
    setSummaryBy("plain");
    by.current = "plain";
    setSummaryNote(null);
    o.onRead(found, plain);

    // Ask for a better summary. The server only calls the AI when the client's AI switch is on.
    if (email.replyText.length >= 20) {
      setWaiting(true);
      try {
        const out = await summariseSent(o.caseId, email.replyText);
        if (mine !== turn.current) return;
        if (out.summary) {
          // Do not overwrite what the person has started to edit.
          // (Read through a function: the value may have changed while the request was out.)
          if (writtenBy() !== "you") {
            by.current = "ai";
            setSummary(out.summary);
            setSummaryBy("ai");
            o.onSummary(out.summary);
          }
        } else {
          setSummaryNote(out.reason);
        }
      } catch {
        if (mine === turn.current) setSummaryNote("The summary could not be improved; this is the opening of the email.");
      } finally {
        if (mine === turn.current) setWaiting(false);
      }
    }
  }

  function remove() {
    turn.current++;
    setEvidence(null);
    setSummary("");
    setError(null);
    setWaiting(false);
  }

  return {
    evidence,
    summary,
    summaryBy,
    summaryNote,
    reading,
    waiting,
    error,
    over,
    remove,
    take,
    editSummary(value: string) {
      by.current = "you";
      setSummary(value);
      setSummaryBy("you");
    },
    /** Put these on the element that should accept a dropped email. */
    dropProps: {
      onDragOver(e: React.DragEvent) {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      },
      onDragLeave(e: React.DragEvent) {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop(e: React.DragEvent) {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setOver(false);
        void take(Array.from(e.dataTransfer.files));
      },
    },
  };
}

export type SentEmailState = ReturnType<typeof useSentEmail>;

/** The line that will be recorded, from what was read and the summary as it stands. */
export function evidenceText(s: SentEmailState, includeSummary: boolean): string {
  if (!s.evidence) return "";
  const { email, recipient } = s.evidence;
  return evidenceLine({ sentAt: email.sentAt, recipient, subject: email.subject, attachments: email.attachments, summary: includeSummary ? s.summary : null });
}

const TONE: Record<Verdict, { box: string; icon: typeof CircleCheck; colour: string }> = {
  ok: { box: "border-ok/40 bg-ok-bg/50", icon: CircleCheck, colour: "text-ok" },
  warn: { box: "border-warn/50 bg-warn-bg/50", icon: AlertTriangle, colour: "text-warn-fg" },
  danger: { box: "border-danger/50 bg-danger-bg/60", icon: AlertTriangle, colour: "text-danger-fg" },
  info: { box: "border-border bg-muted/40", icon: Info, colour: "text-muted-foreground" },
};

/**
 * The drop zone, and once an email has been read, what was found in it. `summaryInNote`
 * means this step already has a box for what was said, so the summary goes there instead.
 */
export function SentEmailBox({ s, summaryInNote, dateWasSet }: { s: SentEmailState; summaryInNote: boolean; dateWasSet: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const picker = (
    <input
      ref={input}
      type="file"
      accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
      className="sr-only"
      aria-label="Choose the sent email file"
      onChange={(e) => {
        void s.take(Array.from(e.target.files ?? []));
        e.target.value = "";
      }}
    />
  );

  if (!s.evidence) {
    return (
      <div className={cn("rounded-lg border-2 border-dashed px-4 py-3.5 text-sm", s.over ? "border-primary bg-accent/60" : "border-input bg-muted/30")}>
        {picker}
        <div className="flex items-start gap-3">
          <FileUp className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">{s.reading ? "Reading the email…" : "Drop the email you sent here"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              From your Sent folder (.msg or .eml), or{" "}
              <button type="button" onClick={() => input.current?.click()} className="rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                choose the file
              </button>
              . The date is taken from it, and a short record is kept: who it went to, the subject, any attachment names and a one-line summary. The email itself is not stored.
            </p>
          </div>
        </div>
        {s.error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {s.error}
          </p>
        )}
      </div>
    );
  }

  const { email, recipient, dateProblem } = s.evidence;
  const tone = TONE[recipient.verdict];
  const Icon = tone.icon;
  return (
    <section aria-labelledby="sent-email-heading" className={cn("rounded-lg border p-4 text-sm", tone.box)}>
      {picker}
      <div className="flex items-start justify-between gap-3">
        <h3 id="sent-email-heading" className="font-semibold">
          From the email you sent
        </h3>
        <button type="button" onClick={s.remove} title="Remove this email and fill the step in by hand" className="flex items-center gap-1 rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          <X className="size-3.5" aria-hidden="true" />
          Remove
        </button>
      </div>

      {/* The answer that matters most: did it go to the person on the case? */}
      <p className="mt-2.5 flex items-start gap-2 font-medium">
        <Icon className={cn("mt-0.5 size-4 shrink-0", tone.colour)} aria-hidden="true" />
        <span className="min-w-0 break-words">{recipient.message}</span>
      </p>

      <dl className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
        <dt className="text-muted-foreground">Sent</dt>
        <dd>
          {email.sentAt ? sentWhen(email.sentAt).words : <span className="text-warn-fg">Not given in the file</span>}
          {dateProblem ? (
            <span className={cn("mt-0.5 flex items-start gap-1.5 text-xs", dateProblem.verdict === "danger" ? "text-danger-fg" : "text-warn-fg")}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {dateProblem.message}
            </span>
          ) : (
            dateWasSet && <span className="block text-xs text-muted-foreground">The date below has been set to this day.</span>
          )}
        </dd>
        <dt className="text-muted-foreground">Subject</dt>
        <dd className="break-words">{email.subject || <span className="text-muted-foreground">(no subject)</span>}</dd>
        <dt className="text-muted-foreground">Attached</dt>
        <dd>
          {email.attachments.length === 0 ? (
            <span className="text-muted-foreground">Nothing</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {email.attachments.map((name, i) => (
                <li key={`${name}-${i}`} className="flex items-start gap-1.5">
                  <Paperclip className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 break-all">{name}</span>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      {!summaryInNote && (
        <div className="mt-3 flex flex-col gap-1.5">
          <label htmlFor="sent-summary" className="font-medium">
            Summary of what was sent
          </label>
          <textarea
            id="sent-summary"
            value={s.summary}
            onChange={(e) => s.editSummary(e.target.value)}
            rows={3}
            maxLength={400}
            className="field-sizing-content min-h-16 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        {summaryInNote
          ? s.waiting
            ? "AI is writing a summary for the box below… "
            : s.summaryBy === "ai"
              ? "AI wrote the summary in the box below; change it if it is not right. "
              : `The opening of the email has been put in the box below${s.summaryNote ? ` (${s.summaryNote.replace(/\.$/, "")})` : ""}; shorten it if you like. `
          : s.waiting
            ? "AI is writing a shorter summary… "
            : s.summaryBy === "ai"
              ? "AI wrote this summary; change it if it is not right. "
              : s.summaryBy === "you"
                ? "Your own wording. "
                : `This is the opening of the email${s.summaryNote ? ` (${s.summaryNote.replace(/\.$/, "")})` : ""}; shorten it if you like. `}
        Only this short record goes on the audit trail. The email and its attachments are not stored.
      </p>
      {s.error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {s.error}
        </p>
      )}
    </section>
  );
}
