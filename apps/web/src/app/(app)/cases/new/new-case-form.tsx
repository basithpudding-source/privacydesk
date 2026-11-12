"use client";

import { useActionState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CASE_TYPES, CHANNELS } from "@/lib/cases/labels";
import { cn } from "@/lib/utils";
import { logCase } from "./actions";
import type { NewCaseValues, NewCaseState } from "./form-state";

const selectClass = cn(
  "h-8 w-full max-w-sm rounded-lg border border-input bg-background px-2.5 text-sm",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
);

export function NewCaseForm({ initial, clients }: { initial: NewCaseValues; clients: { id: string; name: string; code: string }[] }) {
  const [state, formAction, pending] = useActionState<NewCaseState, FormData>(logCase, { values: initial, errors: {} });
  const { values, errors } = state;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      {errors.form && (
        <Alert variant="destructive">
          <AlertTitle>Not logged</AlertTitle>
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}

      <Field id="organisation_id" label="Client" error={errors.organisation_id}>
        <select id="organisation_id" name="organisation_id" defaultValue={values.organisation_id} className={selectClass} required>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="type" label="Type of request" error={errors.type}>
          <select id="type" name="type" defaultValue={values.type} className={selectClass}>
            {CASE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="channel" label="How it arrived" error={errors.channel}>
          <select id="channel" name="channel" defaultValue={values.channel} className={selectClass}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="received_on" label="Date received" hint="The day it reached the organisation. The clock runs from here." error={errors.received_on}>
        <Input id="received_on" name="received_on" type="date" defaultValue={values.received_on} required className="w-44 tabular-nums" aria-invalid={!!errors.received_on} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="requester_name" label="Person's name" error={errors.requester_name}>
          <Input id="requester_name" name="requester_name" defaultValue={values.requester_name} maxLength={200} />
        </Field>
        <Field id="requester_email" label="Person's email" error={errors.requester_email}>
          <Input id="requester_email" name="requester_email" type="email" defaultValue={values.requester_email} aria-invalid={!!errors.requester_email} />
        </Field>
      </div>

      <Field id="summary" label="Summary" hint="One line, plain English. Shown in the case list." error={errors.summary}>
        <Input id="summary" name="summary" defaultValue={values.summary} maxLength={300} aria-invalid={!!errors.summary} />
      </Field>

      <Field id="message" label="The request as received" hint="Paste the email or letter. Leave out bank or health details that are not needed." error={errors.message}>
        <Textarea id="message" name="message" defaultValue={values.message} rows={6} />
      </Field>

      <div className="flex items-start gap-3">
        <input id="id_required" name="id_required" type="checkbox" defaultChecked={values.id_required} className="mt-1 size-4 rounded border-input accent-primary" />
        <Label htmlFor="id_required" className="flex flex-col items-start gap-1 font-normal">
          <span className="font-medium">Proof of identity needed before the clock starts</span>
          <span className="text-sm text-muted-foreground">
            Only when the address does not match records or the data is sensitive. Not for complaints.
          </span>
        </Label>
      </div>
      {errors.id_required && (
        <p className="-mt-4 text-sm text-destructive" role="alert">
          {errors.id_required}
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Logging…" : "Log the case"}
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
