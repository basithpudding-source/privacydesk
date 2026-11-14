"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CircleCheck, ExternalLink, Paperclip, Save, Send, X } from "lucide-react";
import { mailboxMessage, useMailbox } from "@/components/mailbox/use-mailbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { plainSummary, sentWhen } from "@/lib/cases/evidence";
import type { CaseAction } from "@/lib/cases/types";
import { readPending, sentRecord, stepNeeds, writePending, type PendingLetter } from "@/lib/mailbox/pending";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, splitRecipients, type Mailbox, type ReplyInput } from "@/lib/mailbox/types";
import { recordSentLetter } from "./actions";

/** The draft that is open in the letters box, as far as sending it is concerned. */
export interface OpenLetter {
  /** Which letter it is, for example "Acknowledgement". */
  letter: string;
  to: string;
  subject: string;
  /** The reply with the person's original message underneath, when that was asked for. */
  body: string;
  /** The reply alone, for the short summary kept on the audit trail. */
  replyText: string;
  /** Gaps in square brackets still in the draft: it cannot be sent with any left. */
  gaps: number;
  /** The Message-ID of the email being answered, so the reply joins its conversation. */
  inReplyTo: string | null;
  /** The step to record once it has gone; null when the case has no such step open. */
  step: { action: CaseAction; label: string } | null;
}

const box = "rounded-lg border border-border bg-card px-4 py-3 text-sm";

/**
 * Send a reply from the person's own mailbox without leaving the case, or put it in their
 * Drafts to finish in Outlook. Nothing goes unless the person presses Send, here or there.
 * Once the mailbox has accepted it, the step is recorded on the case with a short record of
 * the email. A reply that is saved or sent but not yet recorded is remembered in this browser.
 */
export function MailboxSend({
  caseId,
  isComplaint,
  requesterEmail,
  open,
  onSent,
}: {
  caseId: string;
  isComplaint: boolean;
  requesterEmail: string | null;
  open: OpenLetter | null;
  /** Called once a reply has gone and is on the case, so the letters box can put the draft away. */
  onSent: () => void;
}) {
  const router = useRouter();
  const { mode, mailbox, checking, connecting, error: connectError, connect, disconnect } = useMailbox();
  const [pending, setPending] = useState<PendingLetter | null>(null);
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState<"sending" | "saving" | "checking" | "recording" | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A reply left unfinished on this case earlier, in this browser.
  useEffect(() => {
    const t = setTimeout(() => setPending(readPending(caseId)), 0);
    return () => clearTimeout(t);
  }, [caseId]);

  if (mode === "off") return null;
  if (!open && !pending && !done) return null;

  const remember = (p: PendingLetter | null) => {
    writePending(caseId, p);
    setPending(p);
  };

  const recipients = open ? splitRecipients(open.to) : [];
  const needs = stepNeeds(pending ? pending.action : (open?.step?.action ?? null), isComplaint);
  const missing = (needs.note && !note.trim()) || (needs.outcome && !outcome.trim());

  /** What the mailbox is asked to write: the reply as it stands in the letters box, and any files. */
  async function input(o: OpenLetter): Promise<ReplyInput> {
    return {
      to: splitRecipients(o.to),
      subject: o.subject.trim(),
      body: o.body,
      inReplyTo: o.inReplyTo,
      attachments: await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, bytes: await f.arrayBuffer() }))),
    };
  }

  function letterFor(o: OpenLetter, box: Mailbox, draft: { id: string; webLink: string | null }, state: "draft" | "sent", sentAt: string | null): PendingLetter {
    return {
      state,
      draftId: draft.id,
      webLink: draft.webLink,
      mailbox: box.account.address,
      sample: box.account.sample,
      savedAt: new Date().toISOString(),
      sentAt,
      to: splitRecipients(o.to),
      subject: o.subject.trim(),
      attachments: files.map((f) => f.name),
      summary: plainSummary(o.replyText),
      letter: o.letter,
      action: o.step?.action ?? null,
      stepLabel: o.step?.label ?? null,
    };
  }

  /** Write the sent reply onto the case. It is forgotten here only once the case has it. */
  async function record(p: PendingLetter) {
    setWorking("recording");
    setError(null);
    const out = await recordSentLetter(caseId, sentRecord(p, requesterEmail, { note, outcome })).catch(() => ({ error: "The case could not be reached. Check your connection." }));
    setWorking(null);
    if (out.error) {
      setError(`The email was sent, but it is not on the case yet: ${out.error}`);
      return;
    }
    remember(null);
    setAsking(false);
    setFiles([]);
    setNote("");
    setOutcome("");
    setDone(`Sent ${sentWhen(p.sentAt ?? p.savedAt).words} from ${p.mailbox} and recorded on the case${p.stepLabel ? `: ${p.stepLabel}` : " as a note"}.${p.sample ? " This was the sample mailbox, so nothing was really sent." : ""}`);
    // The draft has gone, so it is put away: left open, the same reply could be sent twice.
    onSent();
    router.refresh();
  }

  async function sendNow(o: OpenLetter) {
    const boxNow = mailbox ?? (await connect("write"));
    if (!boxNow) return;
    setError(null);
    setSaid(null);
    setWorking("sending");
    let draft: { id: string; webLink: string | null } | null = null;
    try {
      draft = await boxNow.saveDraft(await input(o));
      await boxNow.send(draft.id);
    } catch (e) {
      setWorking(null);
      if (draft) {
        // Written but not sent: it is in Drafts, and is tracked like one saved there on purpose.
        remember(letterFor(o, boxNow, draft, "draft", null));
        setAsking(false);
        setError(`It was not sent: ${mailboxMessage(e)} The reply is in your Drafts, so you can send it from Outlook, or try again here.`);
      } else {
        setError(`It was not sent: ${mailboxMessage(e)}`);
      }
      return;
    }
    // Remembered as sent before the case is told, so a failure to record cannot lose it.
    const sent = letterFor(o, boxNow, draft, "sent", new Date().toISOString());
    remember(sent);
    await record(sent);
  }

  async function saveToDrafts(o: OpenLetter) {
    const boxNow = mailbox ?? (await connect("write"));
    if (!boxNow) return;
    setError(null);
    setSaid(null);
    setWorking("saving");
    try {
      const draft = await boxNow.saveDraft(await input(o));
      remember(letterFor(o, boxNow, draft, "draft", null));
      setFiles([]);
      setSaid(draft.threaded ? "Saved to your Drafts as a reply to their email." : "Saved to your Drafts.");
    } catch (e) {
      setError(`It was not saved: ${mailboxMessage(e)}`);
    } finally {
      setWorking(null);
    }
  }

  /** For a reply left in Drafts: ask the mailbox whether it has gone, and if so record it. */
  async function checkSent(p: PendingLetter) {
    const boxNow = mailbox ?? (await connect("write"));
    if (!boxNow) return;
    setError(null);
    setSaid(null);
    setWorking("checking");
    try {
      const status = await boxNow.status(p.draftId);
      if (status.state === "draft") setSaid("It is still in your Drafts. Send it from Outlook, then check again.");
      else if (status.state === "gone") setSaid("It is no longer in the mailbox. If you deleted it, press “Forget it”.");
      else {
        // What the mailbox says was sent is what is recorded, in case it was changed in Outlook.
        remember({ ...p, state: "sent", sentAt: status.sentAt, to: status.to.length ? status.to : p.to, subject: status.subject || p.subject, attachments: status.attachments });
      }
    } catch (e) {
      setError(mailboxMessage(e));
    } finally {
      setWorking(null);
    }
  }

  function chooseFiles(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    const tooBig = chosen.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const kept = [...files, ...chosen.filter((f) => f.size <= MAX_ATTACHMENT_BYTES)].slice(0, MAX_ATTACHMENTS);
    setFiles(kept);
    setSaid(tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over 3 MB and cannot be attached here. Save to Drafts and attach ${tooBig.length === 1 ? "it" : "them"} in Outlook instead.` : null);
  }

  const extra = (needs.note || needs.outcome) && (
    <div className="flex flex-col gap-3">
      {needs.note && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sent-note">{needs.note}</Label>
          <Textarea id="sent-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} required />
        </div>
      )}
      {needs.outcome && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sent-outcome">Outcome</Label>
          <Input id="sent-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={300} required placeholder="Upheld, partly upheld or not upheld, and what was done" />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Kept on the audit trail with the step.</p>
    </div>
  );

  return (
    <section aria-labelledby="mailbox-send-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 id="mailbox-send-heading" className="text-sm font-semibold">
          Send from my mailbox
        </h3>
        {mailbox && (
          <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {mailbox.account.address}
              {mailbox.account.sample ? " (sample: nothing is really sent)" : ""}
            </span>
            <button type="button" onClick={() => void disconnect()} className="rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              Disconnect
            </button>
          </p>
        )}
      </div>

      {/* Shown until another draft is opened. */}
      {done && !open && (
        <p className={`${box} flex items-start gap-2`} role="status">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
          {done}
        </p>
      )}

      {pending?.state === "sent" && (
        <div className={`${box} flex flex-col gap-3`}>
          <p>
            <span className="font-medium">
              The {pending.letter.toLowerCase() || "reply"} was sent {sentWhen(pending.sentAt ?? pending.savedAt).words}
            </span>{" "}
            to {pending.to.join(", ") || "the address on the draft"} and is not on the case yet. {pending.stepLabel ? `Recording it marks the case: ${pending.stepLabel}.` : "Recording it adds a note to the audit trail."}
            {needs.closes ? " That closes the case." : ""}
          </p>
          {extra}
          <div>
            <Button type="button" size="lg" disabled={working !== null || Boolean(missing)} onClick={() => void record(pending)}>
              {working === "recording" ? "Recording…" : "Record it on the case"}
            </Button>
          </div>
        </div>
      )}

      {pending?.state === "draft" && (
        <div className={`${box} flex flex-col gap-3`}>
          <p>
            <span className="font-medium">The {pending.letter.toLowerCase() || "reply"} is in the Drafts of {pending.mailbox}.</span> Open it in Outlook, add any attachments and send it. Then press “Check whether it was sent” and it is recorded on the case
            {pending.stepLabel ? ` (${pending.stepLabel})` : ""}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {pending.webLink && (
              <Button variant="outline" size="lg" render={<a href={pending.webLink} target="_blank" rel="noreferrer" />} nativeButton={false}>
                <ExternalLink data-icon="inline-start" aria-hidden="true" />
                Open it in Outlook
              </Button>
            )}
            <Button type="button" size="lg" disabled={working !== null || connecting} onClick={() => void checkSent(pending)}>
              {working === "checking" ? "Checking…" : "Check whether it was sent"}
            </Button>
            <Button type="button" variant="ghost" size="lg" disabled={working !== null} onClick={() => remember(null)} title="Stop tracking this draft. It stays in your mailbox; nothing is recorded on the case.">
              Forget it
            </Button>
          </div>
        </div>
      )}

      {open && !pending && (
        <>
          {!mailbox ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {mode === "sample"
                  ? "This desk is set to a sample mailbox, so sending can be tried without anything really going out."
                  : "Connect your Microsoft 365 or Outlook.com mailbox to send this reply without leaving the case. It goes from your own address and shows in your Sent folder."}
              </p>
              <div>
                <Button type="button" variant="outline" size="lg" disabled={checking || connecting} onClick={() => void connect("write")}>
                  {checking ? "Checking…" : connecting ? "Waiting for Microsoft's window…" : mode === "sample" ? "Connect the sample mailbox" : "Connect my mailbox"}
                </Button>
              </div>
            </div>
          ) : asking ? (
            <div className={`${box} flex flex-col gap-3`}>
              <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">To</dt>
                <dd className="break-all font-medium">{recipients.join(", ")}</dd>
                <dt className="text-muted-foreground">Subject</dt>
                <dd className="break-words">{open.subject}</dd>
                <dt className="text-muted-foreground">Attached</dt>
                <dd>{files.length ? files.map((f) => f.name).join(", ") : "Nothing"}</dd>
                <dt className="text-muted-foreground">Then</dt>
                <dd>
                  {open.step ? `The case is marked: ${open.step.label}.` : "A note is added to the audit trail, because this step is not open on the case."}
                  {needs.closes ? " That closes the case." : ""}
                </dd>
              </dl>
              {extra}
              <p className="text-xs text-muted-foreground">It goes straight away from {mailbox.account.address} and cannot be called back.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="lg" disabled={working !== null || Boolean(missing)} onClick={() => void sendNow(open)}>
                  <Send data-icon="inline-start" aria-hidden="true" />
                  {working === "sending" ? "Sending…" : working === "recording" ? "Recording…" : "Send it now"}
                </Button>
                <Button type="button" variant="outline" size="lg" disabled={working !== null} onClick={() => setAsking(false)}>
                  Not yet
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="lg" disabled={working !== null || open.gaps > 0 || recipients.length === 0} onClick={() => setAsking(true)}>
                  <Send data-icon="inline-start" aria-hidden="true" />
                  Send…
                </Button>
                <Button type="button" variant="outline" size="lg" disabled={working !== null || recipients.length === 0} onClick={() => void saveToDrafts(open)}>
                  <Save data-icon="inline-start" aria-hidden="true" />
                  {working === "saving" ? "Saving…" : "Save to my Drafts"}
                </Button>
                <input ref={fileInput} type="file" multiple className="sr-only" aria-label="Choose files to attach" onChange={(e) => { chooseFiles(e.target.files); e.target.value = ""; }} />
                <Button type="button" variant="ghost" size="lg" disabled={working !== null || files.length >= MAX_ATTACHMENTS} onClick={() => fileInput.current?.click()}>
                  <Paperclip data-icon="inline-start" aria-hidden="true" />
                  Attach files
                </Button>
              </div>
              {files.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 text-xs">
                  {files.map((f, i) => (
                    <li key={`${f.name}:${i}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                      <Paperclip className="size-3" aria-hidden="true" />
                      <span className="max-w-[14rem] truncate">{f.name}</span>
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {recipients.length === 0
                  ? "Put the person's email address in “To” above first."
                  : open.gaps > 0
                    ? `Fill the ${open.gaps === 1 ? "gap" : `${open.gaps} gaps`} in square brackets before sending. Saving to Drafts is allowed, so you can finish it in Outlook.`
                    : "“Send…” shows what will go and asks once more. Files up to 3 MB each can be attached here; for bigger ones, save to Drafts and attach them in Outlook."}
              </p>
            </>
          )}
        </>
      )}

      {said && (
        <p className="text-sm text-muted-foreground" role="status">
          {said}
        </p>
      )}
      {(error || connectError) && (
        <p className="text-sm text-destructive" role="alert">
          {error ?? connectError}
        </p>
      )}
    </section>
  );
}
