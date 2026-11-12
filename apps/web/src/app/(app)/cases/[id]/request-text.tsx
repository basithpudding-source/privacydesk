"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The person's own message, shown in the case's top pane. A long one is cut to a few lines
 * so the steps below stay in view, with a button to read all of it.
 */
export function RequestText({ text }: { text: string }) {
  const para = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);

  // Whether the text is cut depends on the width of the pane, so measure it rather than
  // count characters. The observer reports once when it starts and again on every resize.
  useEffect(() => {
    const el = para.current;
    if (!el || open) return;
    const seen = new ResizeObserver(() => setLong(el.scrollHeight > el.clientHeight + 1));
    seen.observe(el);
    return () => seen.disconnect();
  }, [open, text]);

  return (
    <>
      <p ref={para} id="request-text" className={cn("mt-3 max-w-[65ch] whitespace-pre-wrap break-words text-sm", !open && "line-clamp-8")}>
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
