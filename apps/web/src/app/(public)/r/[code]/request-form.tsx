"use client";

import { useActionState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REQUEST_KINDS, readableOn } from "@/lib/public-form/copy";
import { cn } from "@/lib/utils";
import { EMPTY_REQUEST, type RequestFormState } from "./form-state";

type Action = (prev: RequestFormState, formData: FormData) => Promise<RequestFormState>;

export function RequestForm({ action, organisationName, colour }: { action: Action; organisationName: string; colour: string }) {
  const [state, formAction, pending] = useActionState(action, { status: "editing", values: EMPTY_REQUEST, errors: {} });
  const { values, errors } = state;

  if (state.status === "sent") {
    return (
      <div aria-live="polite">
        <h2 className="text-xl font-semibold tracking-tight">Check your email</h2>
        <p className="mt-3">
          We have sent a link to <span className="font-medium">{values.email}</span>. Open it within 24 hours to send your request to {organisationName}.
          Nothing is sent until you do.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Not arrived after a few minutes? Check your spam folder. The link comes from Privacy Desk, the software {organisationName} uses.</p>
        {state.devLink && (
          <Alert className="mt-6">
            <AlertTitle>Development only: no email sender is configured</AlertTitle>
            <AlertDescription>
              <a href={state.devLink} className="break-all underline underline-offset-4">
                {state.devLink}
              </a>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {errors.form && (
        <Alert variant="destructive">
          <AlertTitle>Your request was not sent</AlertTitle>
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}

      <Field id="name" label="Your name" error={errors.name}>
        <Input id="name" name="name" defaultValue={values.name} autoComplete="name" required maxLength={200} aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} />
      </Field>

      <Field id="email" label="Your email address" hint="We will send you a link to confirm it is yours before the request is sent." error={errors.email}>
        <Input id="email" name="email" type="email" defaultValue={values.email} autoComplete="email" required maxLength={254} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : "email-hint"} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">What are you asking for?</legend>
        <div className="mt-1 flex flex-col gap-2">
          {REQUEST_KINDS.map((k) => (
            <label key={k.value} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3", "has-[:checked]:border-foreground/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50")}>
              <input type="radio" name="kind" value={k.value} defaultChecked={values.kind === k.value} required className="mt-1 size-4 accent-[var(--client)]" />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{k.label}</span>
                <span className="text-sm text-muted-foreground">{k.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.kind && (
          <p className="text-sm text-destructive" role="alert">
            {errors.kind}
          </p>
        )}
      </fieldset>

      <Field id="details" label="What would you like to tell us?" hint="Say what you want and anything that helps find your records, such as a customer number. Do not include bank details, health information or passwords." error={errors.details}>
        <Textarea id="details" name="details" defaultValue={values.details} rows={6} required minLength={10} maxLength={10000} aria-invalid={!!errors.details} aria-describedby={errors.details ? "details-error" : "details-hint"} />
      </Field>

      {/* Not shown to people; scripts fill it in. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          style={{ backgroundColor: colour, color: readableOn(colour) }}
        >
          {pending ? "Sending the link…" : "Send me a link to confirm my email"}
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
