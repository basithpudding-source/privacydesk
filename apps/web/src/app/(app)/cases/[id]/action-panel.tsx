"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EMAIL_STEPS } from "@/lib/cases/evidence";
import type { CaseAction } from "@/lib/cases/types";
import { cn } from "@/lib/utils";
import { applyCaseAction, type ActionState } from "./actions";
import { evidenceText, SentEmailBox, useSentEmail } from "./sent-email";

interface ActionCopy {
  title: string;
  explain: string;
  dateLabel?: string;
  noteLabel?: string;
  noteRequired?: boolean;
  outcome?: boolean;
  button: string;
}

const COPY: Record<CaseAction, (isComplaint: boolean) => ActionCopy> = {
  acknowledge: (c) => ({
    title: "Mark acknowledged",
    explain: c ? "Record the date the acknowledgement went out. For a complaint this meets the 30-day duty." : "Record the date the acknowledgement went out.",
    dateLabel: "Acknowledged on",
    button: "Mark acknowledged",
  }),
  ask_id: () => ({
    title: "Ask for proof of identity",
    explain: "Only when the address does not match records or the data is sensitive. The clock waits until it arrives.",
    dateLabel: "Asked on",
    noteLabel: "What you asked for (optional)",
    button: "Record ID request (clock waits)",
  }),
  id_received: () => ({
    title: "Proof of identity received",
    explain: "The one-month clock starts on this day.",
    dateLabel: "Received on",
    button: "Record ID received (clock starts)",
  }),
  pause: () => ({
    title: "Ask for clarification",
    explain: "Only if the request is too vague to search. The clock stops on this day and restarts the day after the answer arrives.",
    dateLabel: "Asked on",
    noteLabel: "What you asked them to clarify",
    noteRequired: true,
    button: "Ask for clarification (stops the clock)",
  }),
  resume: () => ({
    title: "Clarification received",
    explain: "The clock restarts the day after this date.",
    dateLabel: "Received on",
    noteLabel: "What they said (optional)",
    button: "Record clarification (restarts the clock)",
  }),
  extend: () => ({
    title: "Extend to three months",
    explain: "Only for a complex or numerous request, and the person must be told within the first month, with the reason.",
    dateLabel: "Person told on",
    noteLabel: "Why the request is complex",
    noteRequired: true,
    button: "Extend to three months",
  }),
  note: () => ({
    title: "Add a note",
    explain: "Goes on the audit trail with today's date. Notes cannot be edited later.",
    noteLabel: "Note",
    noteRequired: true,
    button: "Add note",
  }),
  close: (c) => ({
    title: c ? "Close with outcome" : "Close: response sent",
    explain: c ? "Record the outcome you gave the person." : "Record the date the response went out.",
    dateLabel: c ? "Outcome sent on" : "Response sent on",
    noteLabel: c ? undefined : "Note (optional)",
    outcome: c,
    button: c ? "Close with outcome" : "Close: response sent",
  }),
  reopen: () => ({
    title: "Reopen",
    explain: "Puts the case back on the list. The closure stays on the audit trail.",
    dateLabel: "Reopened on",
    noteLabel: "Why (optional)",
    button: "Reopen the case",
  }),
};

export function ActionPanel({
  caseId,
  action,
  isComplaint,
  today,
  requesterEmail,
  receivedOn,
}: {
  caseId: string;
  action: CaseAction;
  isComplaint: boolean;
  today: string;
  /** The person's address on the case, to check a dropped email against. */
  requesterEmail: string | null;
  receivedOn: string;
}) {
  const copy = COPY[action](isComplaint);
  const bound = applyCaseAction.bind(null, caseId, action);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(bound, {
    error: null,
    values: { on: today, note: "", outcome: "" },
  });
  const [on, setOn] = useState(today);
  const [note, setNote] = useState("");
  const [dateWasSet, setDateWasSet] = useState(false);
  const noteTouched = useRef(false);

  // Steps that mean an email went to the person can be filled in from that email.
  const takesEmail = EMAIL_STEPS.includes(action);
  // Where the step already asks what was said (a clarification, an extension), the summary
  // of the email goes in that box instead of a second one.
  const summaryInNote = Boolean(copy.noteRequired);
  const sent = useSentEmail({
    caseId,
    requesterEmail,
    receivedOn,
    today,
    onRead(found, plain) {
      // The step is dated by the day the email was sent, when that day can stand.
      if (found.sentOn && !found.dateProblem) {
        setOn(found.sentOn);
        setDateWasSet(true);
      } else {
        setDateWasSet(false);
      }
      if (summaryInNote && !noteTouched.current) setNote(plain);
    },
    onSummary(text) {
      if (summaryInNote && !noteTouched.current) setNote(text);
    },
  });

  return (
    <aside
      aria-labelledby="action-heading"
      {...(takesEmail ? sent.dropProps : {})}
      className={cn("surface border-ring/50 p-5 ring-3 ring-ring/15", takesEmail && sent.over && "border-primary ring-primary/40")}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="action-heading" className="text-lg font-semibold">
          {copy.title}
        </h2>
        <Link href={`/cases/${caseId}`} scroll={false} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Cancel
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{copy.explain}</p>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        {state.error && (
          <Alert variant="destructive">
            <AlertTitle>Not recorded</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {takesEmail && (
          <>
            <SentEmailBox s={sent} summaryInNote={summaryInNote} dateWasSet={dateWasSet} />
            {/* The short record of the email, added to the audit entry for this step. */}
            <input type="hidden" name="evidence" value={evidenceText(sent, !summaryInNote)} />
          </>
        )}
        {copy.dateLabel && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="on">{copy.dateLabel}</Label>
            <Input
              id="on"
              name="on"
              type="date"
              value={on}
              onChange={(e) => {
                setOn(e.target.value);
                setDateWasSet(false);
              }}
              max={today}
              required
              className="w-44 tabular-nums"
              autoFocus={!takesEmail}
            />
          </div>
        )}
        {copy.outcome && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="outcome">Outcome</Label>
            <Input id="outcome" name="outcome" defaultValue={state.values.outcome} required maxLength={300} placeholder="Upheld, partly upheld or not upheld, and what was done" />
          </div>
        )}
        {copy.noteLabel && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="note">{copy.noteLabel}</Label>
            <Textarea
              id="note"
              name="note"
              value={note}
              onChange={(e) => {
                noteTouched.current = true;
                setNote(e.target.value);
              }}
              required={copy.noteRequired}
              rows={4}
              maxLength={2000}
              autoFocus={!copy.dateLabel}
            />
          </div>
        )}
        <div>
          <Button type="submit" disabled={pending || sent.reading}>
            {pending ? "Recording…" : copy.button}
          </Button>
        </div>
      </form>
    </aside>
  );
}
