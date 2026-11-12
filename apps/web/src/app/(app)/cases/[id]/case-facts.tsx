"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PANE_ROW, PANE_SECOND } from "./pane-grid";

/**
 * The second row of a case's top pane: the case's details and the request as received.
 * It starts closed, showing only the two headings, so the due date and the steps have the
 * screen. The row opens and closes as one: either heading does it.
 */
export function CaseFacts({ details, request }: { details: ReactNode; request: ReactNode | null }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

  return (
    <div className={cn(PANE_ROW, "border-t border-border", open ? "py-5" : "gap-y-2 py-3")}>
      <section aria-labelledby="details-heading" className={cn("min-w-0", !request && "@2xl:col-span-2")}>
        <FactsHeading id="details-heading" controls="details-body" open={open} onToggle={toggle}>
          Details
        </FactsHeading>
        <div id="details-body" hidden={!open}>
          {details}
        </div>
      </section>
      {request && (
        <section aria-labelledby="request-heading" className={PANE_SECOND}>
          <FactsHeading id="request-heading" controls="request-body" open={open} onToggle={toggle}>
            The request as received
          </FactsHeading>
          <div id="request-body" hidden={!open}>
            {request}
          </div>
        </section>
      )}
    </div>
  );
}

/** A heading that is also the button for the row, with an arrow that shows which way it goes. */
function FactsHeading({ id, controls, open, onToggle, children }: { id: string; controls: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <h2 id={id} className="section-label">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={controls}
        onClick={onToggle}
        title={open ? "Hide the details and the request" : "Show the details and the request"}
        // Wider and taller than the words, so the whole heading line is the target.
        className="-mx-1.5 -my-1 flex w-[calc(100%+0.75rem)] cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-left uppercase outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {children}
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
    </h2>
  );
}
