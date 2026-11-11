"use client";

import Link from "next/link";
import { useActionState } from "react";
import { longDate } from "@/lib/clocks";
import { readableOn } from "@/lib/public-form/copy";
import { READY, type ConfirmState } from "./confirm-state";

type Action = (prev: ConfirmState, formData: FormData) => Promise<ConfirmState>;

/**
 * The page the emailed link opens. It shows one button; pressing it sends the request.
 * Nothing happens until then, so software that merely opens links cannot send a request
 * or start the clock on someone's behalf.
 */
export function ConfirmRequest({ action, organisationName, code, colour }: { action: Action; organisationName: string; code: string; colour: string }) {
  const [state, formAction, pending] = useActionState(action, READY);

  if (state.status === "done") {
    return (
      <div aria-live="polite">
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{state.already ? "Your request was already sent" : "Your request has been sent"}</h1>
        <p className="mt-3 text-muted-foreground">Thank you for confirming your email address. Keep the reference below; a copy has been emailed to you.</p>

        <dl className="mt-8 grid grid-cols-[9rem_1fr] gap-y-3 rounded-lg border border-border p-5 text-sm">
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="font-mono text-base font-semibold">{state.ref}</dd>
          <dt className="text-muted-foreground">Received</dt>
          <dd>{longDate(state.receivedOn)}</dd>
          <dt className="text-muted-foreground">What you asked for</dt>
          <dd>{state.kindLabel}</dd>
          <dt className="text-muted-foreground">What happens next</dt>
          <dd>
            {state.sentence} If they need to check who you are first, the time runs from when they receive that proof; they will tell you if so.
          </dd>
          <dt className="text-muted-foreground">Questions</dt>
          <dd>{state.contactEmail ? <>Email {state.contactEmail} and quote your reference.</> : <>Contact {state.organisationName} and quote your reference.</>}</dd>
        </dl>

        <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
          {state.organisationName} is responsible for handling your request. If you are unhappy with how it is handled, you can complain to the Information Commissioner&apos;s Office (ICO) at ico.org.uk.
        </p>
      </div>
    );
  }

  if (state.status === "problem") {
    return (
      <div aria-live="polite">
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{state.title}</h1>
        <p className="mt-3 text-muted-foreground">{state.message}</p>
        <p className="mt-6">
          <Link href={`/r/${code.toLowerCase()}`} className="underline underline-offset-4">
            Go to the form
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Send your request to {organisationName}</h1>
      <p className="mt-3 text-muted-foreground">
        Thank you for opening the link. Press the button to confirm this is your email address and send your request. Nothing is sent until you do.
      </p>
      <div className="mt-8">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          style={{ backgroundColor: colour, color: readableOn(colour) }}
        >
          {pending ? "Sending your request…" : "Confirm and send my request"}
        </button>
      </div>
    </form>
  );
}
