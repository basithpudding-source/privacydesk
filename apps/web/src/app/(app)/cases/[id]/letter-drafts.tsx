"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CircleCheck, Copy, Mail, PenLine, SearchCheck, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  composeEmailBody,
  emailLaunch,
  findFlags,
  highlightSegments,
  mailtoLimit,
  quotedOriginal,
  type Flag,
  type KnownDate,
  type LetterKind,
  type OriginalMessage,
} from "@/lib/letters/email";
import { cn } from "@/lib/utils";

const KINDS: { kind: LetterKind; label: string; forComplaint: boolean; forRequest: boolean }[] = [
  { kind: "ack", label: "Acknowledgement", forComplaint: true, forRequest: true },
  { kind: "id", label: "Ask for proof of identity", forComplaint: false, forRequest: true },
  { kind: "clarify", label: "Ask for clarification", forComplaint: false, forRequest: true },
  { kind: "extend", label: "Extension notice", forComplaint: false, forRequest: true },
  { kind: "outcome", label: "Outcome / response", forComplaint: true, forRequest: true },
];

export interface LetterEmail {
  /** The person's address from the case; empty when the case has none. */
  to: string;
  /** A subject for each kind of letter, with the case reference. */
  subjects: Record<LetterKind, string>;
  /** The person's own message, to quote under the reply; null when the case holds none. */
  original: OriginalMessage | null;
  /** Whether quoting starts switched on (it does when they wrote by email or web form). */
  quoteByDefault: boolean;
  knownDates: KnownDate[];
  /** This case's reference first, then the reference a web form gave, if any. */
  refs: string[];
  requesterName: string | null;
  /** False when the sender's profile has no name or no job title. */
  signerComplete: boolean;
  /** The step to record on the case once each kind of letter has gone. */
  record: Partial<Record<LetterKind, { href: string; label: string }>>;
}

/** A finished draft as it stood when it was discarded, so it can be put back. */
interface Discarded {
  kind: LetterKind;
  text: string;
  to: string;
  subject: string;
  quote: boolean;
}

// The draft and the highlights behind it must wrap identically, so both use exactly these.
const layer = "[grid-area:1/1] min-h-48 whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-sm leading-6";

/**
 * A draft streams into the box; the person edits it, checks what is highlighted, and opens it
 * in their own email program with the recipient, subject, text and the original message
 * filled in. Nothing is sent from here: they press send themselves.
 *
 * A draft is only ever on this screen. It can be stopped while it is being written, or
 * discarded afterwards, which puts the box back as it was before a letter was chosen.
 */
export function LetterDrafts({ caseId, isComplaint, aiOn, email }: { caseId: string; isComplaint: boolean; aiOn: boolean; email: LetterEmail }) {
  const [kind, setKind] = useState<LetterKind | null>(null);
  const [text, setText] = useState("");
  const [to, setTo] = useState(email.to);
  const [subject, setSubject] = useState("");
  const [quote, setQuote] = useState(email.quoteByDefault && Boolean(email.original));
  const [busy, setBusy] = useState<LetterKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  // The request that is writing a draft, so it can be stopped.
  const writing = useRef<{ stop: AbortController | null }>({ stop: null });
  // The last finished draft that was discarded: one wrong click must not lose a person's edits.
  const [discarded, setDiscarded] = useState<Discarded | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<{ place: "status" | "draft"; n: number } | null>(null);
  const status = useRef<HTMLParagraphElement>(null);

  // Leaving the page stops a draft that is still being written.
  useEffect(() => {
    const held = writing.current;
    return () => held.stop?.abort();
  }, []);

  // The button that discards a draft, or puts one back, disappears when it is pressed. Move
  // to what replaced it, so keyboard and screen reader users are not left nowhere.
  useEffect(() => {
    if (!moveTo) return;
    (moveTo.place === "draft" ? area.current : status.current)?.focus();
  }, [moveTo]);

  const checks = useMemo(
    () => findFlags(text, { knownDates: email.knownDates, refs: email.refs, requesterName: email.requesterName }),
    [text, email.knownDates, email.refs, email.requesterName],
  );
  const segments = useMemo(() => highlightSegments(text, checks.flags), [text, checks.flags]);
  const gaps = checks.flags.filter((f) => f.level === "fill");
  const doubts = checks.flags.filter((f) => f.level === "check");
  const body = composeEmailBody(text, quote ? email.original : null);

  async function draft(next: LetterKind) {
    writing.current.stop?.abort();
    const stop = new AbortController();
    writing.current.stop = stop;
    setBusy(next);
    setKind(next);
    setSubject(email.subjects[next]);
    setError(null);
    setNotice(null);
    setDiscarded(null);
    setSaid(null);
    setText("");
    try {
      const res = await fetch("/api/letters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, kind: next }), signal: stop.signal });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "The draft could not be written.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (stop.signal.aborted) return;
        setText(acc);
      }
    } catch {
      // Stopped by the person: that is not a failure.
      if (!stop.signal.aborted) setError("The draft could not be written. Try again.");
    } finally {
      // A stopped request has already been cleared away, and may have been replaced.
      if (writing.current.stop === stop) {
        writing.current.stop = null;
        setBusy(null);
      }
    }
  }

  /** Stop a draft that is being written, or clear a finished one, and go back to the start. */
  function discard() {
    const partWritten = busy !== null;
    writing.current.stop?.abort();
    writing.current.stop = null;
    // A finished draft can be put back; one stopped part way is simply dropped.
    setDiscarded(!partWritten && kind && text.trim() ? { kind, text, to, subject, quote } : null);
    setSaid(partWritten ? "Stopped. The part-written draft was not kept." : "Draft discarded.");
    setBusy(null);
    setKind(null);
    setText("");
    setSubject("");
    setTo(email.to);
    setQuote(email.quoteByDefault && Boolean(email.original));
    setError(null);
    setNotice(null);
    setCopied(false);
    setMoveTo((m) => ({ place: "status", n: (m?.n ?? 0) + 1 }));
  }

  function putBack() {
    if (!discarded) return;
    setKind(discarded.kind);
    setText(discarded.text);
    setTo(discarded.to);
    setSubject(discarded.subject);
    setQuote(discarded.quote);
    setDiscarded(null);
    setSaid(null);
    setMoveTo((m) => ({ place: "draft", n: (m?.n ?? 0) + 1 }));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed; select the text and copy it yourself.");
    }
  }

  /** Select a flagged piece of the draft and bring it into view. */
  function show(flag: Flag, index: number) {
    area.current?.focus();
    area.current?.setSelectionRange(flag.start, flag.end);
    mirror.current?.querySelector(`[data-flag="${index}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function openInEmail() {
    setError(null);
    const launch = emailLaunch({ to, subject, reply: text, original: quote ? email.original : null, limit: mailtoLimit(navigator.userAgent) });
    const left = gaps.length ? ` ${gaps.length === 1 ? "One gap in square brackets is" : `${gaps.length} gaps in square brackets are`} still in the draft: fill ${gaps.length === 1 ? "it" : "them"} in before you send.` : "";
    const unsent = "Nothing has been sent: read it there and press send yourself.";
    // Whatever did not fit in the link goes on the clipboard, to paste in the email program.
    let copiedOver = true;
    if (launch.clipboard) {
      try {
        await navigator.clipboard.writeText(launch.clipboard);
      } catch {
        copiedOver = false;
      }
    }
    if (launch.carried === "all") {
      setNotice(`Your email program should now be opening with the recipient, subject and this draft filled in. ${unsent}${left}`);
    } else if (launch.carried === "reply") {
      setNotice(
        copiedOver
          ? `Your email program should now be opening with the recipient, subject and your reply filled in. Their original message was too long to hand over with it, so it is on your clipboard: click at the end of the message and press Ctrl+V to put it underneath. ${unsent}${left}`
          : `Your email program should now be opening with the recipient, subject and your reply filled in. Their original message was too long to hand over with it. ${unsent}${left}`,
      );
    } else {
      setNotice(
        copiedOver
          ? `This email is too long to hand over in one go, so the recipient and subject are filled in and the text is on your clipboard: click in the message and press Ctrl+V. ${unsent}${left}`
          : `This email is too long to hand over in one go. The recipient and subject are filled in; use “Copy the email text” and paste it into the message. ${unsent}${left}`,
      );
    }
    // Follow the link as a click on a real link would, so the browser hands it to the email program.
    const link = document.createElement("a");
    link.href = launch.href;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const record = kind ? email.record[kind] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {aiOn ? "AI writes a first draft from the case facts." : "AI is off, so these are templates with gaps in square brackets."} Nothing is sent from here: check it, then open it in your own email program and send it yourself.
      </p>
      <div className="flex flex-wrap gap-2">
        {KINDS.filter((k) => (isComplaint ? k.forComplaint : k.forRequest)).map((k) => (
          <Button key={k.kind} type="button" variant={kind === k.kind ? "secondary" : "outline"} size="sm" disabled={busy !== null} aria-pressed={kind === k.kind} onClick={() => draft(k.kind)}>
            {busy === k.kind ? "Drafting…" : k.label}
          </Button>
        ))}
      </div>
      {!email.signerComplete && (
        <p className="text-xs text-muted-foreground">
          Add your name and job title on{" "}
          <Link href="/settings/profile" className="underline underline-offset-4">
            your profile
          </Link>{" "}
          and every draft will be signed with them.
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {/* Always present, so a screen reader announces what is put into it. */}
      <p
        ref={status}
        tabIndex={-1}
        role="status"
        className={cn("rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", said ? "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" : "sr-only")}
      >
        {said}
        {said && discarded && (
          <button type="button" onClick={putBack} className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            Put it back
          </button>
        )}
      </p>

      {kind && (text || busy) && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Draft: {KINDS.find((k) => k.kind === kind)?.label}</h3>
            <Button type="button" variant="outline" size="sm" onClick={discard} title={busy ? "Stop writing and clear what has been written so far" : "Clear this draft and go back to choosing a letter"}>
              {busy ? <Square data-icon="inline-start" aria-hidden="true" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              {busy ? "Stop and discard" : "Discard draft"}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="letter-to">To</Label>
              <Input id="letter-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="The person's email address" className={cn("bg-card", !to.trim() && "border-warn")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="letter-subject">Subject</Label>
              <Input id="letter-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-card" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="letter-body">Your reply</Label>
            {/* Two layers in one grid cell: the highlights (sized by the text) under the box you type in. */}
            <div className="grid rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <div ref={mirror} aria-hidden="true" className={cn(layer, "pointer-events-none text-transparent")}>
                {segments.map((s, i) =>
                  s.flag === null ? (
                    <span key={i}>{s.text}</span>
                  ) : (
                    <mark
                      key={i}
                      data-flag={s.flag}
                      className={cn("rounded-sm text-transparent", checks.flags[s.flag].level === "fill" ? "bg-warn-bg ring-1 ring-warn/70" : "bg-danger-bg ring-1 ring-danger/60")}
                    >
                      {s.text}
                    </mark>
                  ),
                )}{" "}
              </div>
              <textarea
                id="letter-body"
                ref={area}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck
                className={cn(layer, "resize-none overflow-hidden rounded-lg bg-transparent outline-none")}
              />
            </div>
          </div>

          {email.original && (
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={quote} onChange={(e) => setQuote(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                <span>
                  <span className="font-medium">Put their original message under my reply</span>
                  <span className="block text-xs text-muted-foreground">As a reply from your mailbox would. It is added when you open or copy the email.</span>
                </span>
              </label>
              {quote && (
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 px-3 py-2.5 font-mono text-xs leading-5 text-muted-foreground">{quotedOriginal(email.original)}</pre>
              )}
            </div>
          )}

          {!busy && (
            <section aria-labelledby="letter-checks" className="rounded-lg border border-border bg-muted/30 p-4">
              <h3 id="letter-checks" className="text-sm font-semibold">
                Before you send
              </h3>
              <ul className="mt-2.5 flex flex-col gap-2 text-sm">
                {gaps.length > 0 && (
                  <li className="flex items-start gap-2.5">
                    <PenLine className="mt-0.5 size-4 shrink-0 text-warn-fg" aria-hidden="true" />
                    <div className="min-w-0">
                      <p>
                        <span className="font-medium">
                          {gaps.length} {gaps.length === 1 ? "gap" : "gaps"} to fill in,
                        </span>{" "}
                        highlighted in amber:
                      </p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5">
                        {checks.flags.map((f, i) =>
                          f.level === "fill" ? (
                            <button
                              key={i}
                              type="button"
                              onClick={() => show(f, i)}
                              title="Select this in the draft"
                              className="max-w-full truncate rounded-md bg-warn-bg px-2 py-0.5 font-mono text-xs text-warn-fg outline-none hover:ring-1 hover:ring-warn focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              {f.text}
                            </button>
                          ) : null,
                        )}
                      </p>
                    </div>
                  </li>
                )}
                {checks.flags.map((f, i) =>
                  f.level === "check" ? (
                    <li key={i} className="flex items-start gap-2.5">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-fg" aria-hidden="true" />
                      <p className="min-w-0">
                        {f.message}.{" "}
                        <button type="button" onClick={() => show(f, i)} className="rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                          Show me
                        </button>
                      </p>
                    </li>
                  ) : null,
                )}
                {!to.trim() && (
                  <li className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn-fg" aria-hidden="true" />
                    <p>The case has no email address for this person. Add it in “To” above, or in your email program.</p>
                  </li>
                )}
                {checks.matched.length > 0 && (
                  <li className="flex items-start gap-2.5">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                    <p className="min-w-0">
                      {checks.matched.length === 1 ? "The date in the draft matches" : "The dates in the draft match"} the case: {checks.matched.map((m) => `${m.text} (${m.label})`).join("; ")}
                      {doubts.some((d) => d.message.includes("date")) ? ", apart from what is flagged above" : ""}.
                    </p>
                  </li>
                )}
                <li className="flex items-start gap-2.5">
                  <SearchCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p>
                    {aiOn ? "AI wrote this from the case facts and can be wrong." : "This is a template."} Read every sentence: you are the sender, and the app only checks gaps, dates, the reference and the greeting.
                  </p>
                </li>
              </ul>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="lg" onClick={openInEmail} disabled={!text.trim() || busy !== null}>
              <Mail data-icon="inline-start" aria-hidden="true" />
              Open in my email program
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={copy} disabled={!text.trim()}>
              <Copy data-icon="inline-start" aria-hidden="true" />
              {copied ? "Copied" : "Copy the email text"}
            </Button>
          </div>

          {notice && (
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm" role="status">
              <p>{notice}</p>
              {record && (
                <p className="mt-2">
                  Once it has gone, record it on the case:{" "}
                  <Link href={record.href} scroll={false} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                    {record.label}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
