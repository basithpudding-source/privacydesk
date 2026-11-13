"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The person's own message, shown in the case's top pane: the subject line it arrived under,
 * then what they wrote. The subject is there to find the original in a mailbox, so it can be
 * copied. A long message is cut to a few lines so the steps below stay in view, with a
 * button to read all of it.
 */
export function RequestText({
  text,
  subject,
}: {
  text: string;
  /** Left out when the case was not made from a message; null when the message had no subject line. */
  subject?: string | null;
}) {
  const para = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  // Whether the text is cut depends on the width of the pane, so measure it rather than
  // count characters. The observer reports once when it starts and again on every resize.
  useEffect(() => {
    const el = para.current;
    if (!el || open) return;
    const seen = new ResizeObserver(() => setLong(el.scrollHeight > el.clientHeight + 1));
    seen.observe(el);
    return () => seen.disconnect();
  }, [open, text]);

  async function copySubject() {
    if (!subject) return;
    try {
      await navigator.clipboard.writeText(subject);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <>
      {subject !== undefined && (
        <p className="mt-3 flex max-w-[65ch] items-start gap-x-3 text-sm">
          <span className="shrink-0 text-muted-foreground">Subject</span>
          {subject ? (
            <>
              <span className="min-w-0 break-words font-medium">{subject}</span>
              <button
                type="button"
                onClick={copySubject}
                title="Copy the subject line, to search for it in your email program"
                aria-label="Copy the subject line"
                className="-my-0.5 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {copied === "yes" ? <Check className="size-3.5 text-ok" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              </button>
              {/* Always present, so a screen reader announces what is put into it. */}
              <span role="status" className={cn("shrink-0 text-xs text-muted-foreground", !copied && "sr-only")}>
                {copied === "yes" ? "Copied" : copied === "no" ? "Could not copy: select the text instead" : ""}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">None: the message arrived without a subject line</span>
          )}
        </p>
      )}
      <p ref={para} id="request-text" className={cn("max-w-[65ch] whitespace-pre-wrap break-words text-sm", subject !== undefined ? "mt-2" : "mt-3", !open && "line-clamp-8")}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="request-text"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {open ? "Show less" : "Show all of it"}
        </button>
      )}
    </>
  );
}
