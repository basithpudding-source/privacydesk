"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const KINDS: { kind: string; label: string; forComplaint: boolean; forRequest: boolean }[] = [
  { kind: "ack", label: "Acknowledgement", forComplaint: true, forRequest: true },
  { kind: "id", label: "Ask for proof of identity", forComplaint: false, forRequest: true },
  { kind: "clarify", label: "Ask for clarification", forComplaint: false, forRequest: true },
  { kind: "extend", label: "Extension notice", forComplaint: false, forRequest: true },
  { kind: "outcome", label: "Outcome / response", forComplaint: true, forRequest: true },
];

/** Drafts stream into the box. The person edits, copies, and sends from their own email. */
export function LetterDrafts({ caseId, isComplaint, aiOn }: { caseId: string; isComplaint: boolean; aiOn: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function draft(kind: string) {
    setBusy(kind);
    setError(null);
    setText("");
    try {
      const res = await fetch("/api/letters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, kind }) });
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
        setText(acc);
      }
    } catch {
      setError("The draft could not be written. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed; select the text and copy it yourself.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {aiOn ? "AI writes a first draft from the case facts." : "AI is off, so these are templates with gaps in square brackets."} Nothing is sent from here: edit it, then send it from your own email.
      </p>
      <div className="flex flex-wrap gap-2">
        {KINDS.filter((k) => (isComplaint ? k.forComplaint : k.forRequest)).map((k) => (
          <Button key={k.kind} type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => draft(k.kind)}>
            {busy === k.kind ? "Drafting…" : k.label}
          </Button>
        ))}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {(text || busy) && (
        <>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} aria-label="Letter draft" className="font-mono text-sm" />
          <div>
            <Button type="button" size="sm" onClick={copy} disabled={!text}>
              {copied ? "Copied" : "Copy draft"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
