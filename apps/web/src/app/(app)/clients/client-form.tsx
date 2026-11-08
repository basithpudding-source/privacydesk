"use client";

import { useActionState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REGIONS } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import type { ClientFormState } from "./form-state";

type Action = (prev: ClientFormState, formData: FormData) => Promise<ClientFormState>;

export function ClientForm({
  action,
  initial,
  submitLabel,
}: {
  action: Action;
  initial: ClientFormState["values"];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { values: initial, errors: {} });
  const { values, errors } = state;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      {errors.form && (
        <Alert variant="destructive">
          <AlertTitle>Not saved</AlertTitle>
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}

      <Field id="name" label="Organisation name" error={errors.name}>
        <Input id="name" name="name" defaultValue={values.name} required maxLength={200} autoFocus aria-invalid={!!errors.name} />
      </Field>

      <Field
        id="code"
        label="Short code"
        hint="2 to 6 capital letters or digits. Used in case references, so it cannot change once cases exist."
        error={errors.code}
      >
        <Input
          id="code"
          name="code"
          defaultValue={values.code}
          required
          maxLength={6}
          className="w-32 font-mono uppercase"
          aria-invalid={!!errors.code}
        />
      </Field>

      <Field id="colour" label="Colour" hint="Shown on the client's public form and in lists." error={errors.colour}>
        <input
          id="colour"
          name="colour"
          type="color"
          defaultValue={values.colour}
          className="h-9 w-16 cursor-pointer rounded-lg border border-input bg-transparent p-1"
        />
      </Field>

      <Field id="region" label="Region" hint="Decides which bank holidays move a deadline." error={errors.region}>
        <select
          id="region"
          name="region"
          defaultValue={values.region}
          className={cn(
            "h-8 w-full max-w-xs rounded-lg border border-input bg-background px-2.5 text-sm",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
        >
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          id="internal_target_days"
          label="Internal target (days)"
          hint="A target for the team, not the legal deadline. Default 28."
          error={errors.internal_target_days}
        >
          <Input
            id="internal_target_days"
            name="internal_target_days"
            type="number"
            min={1}
            max={90}
            defaultValue={values.internal_target_days}
            className="w-24 tabular-nums"
            aria-invalid={!!errors.internal_target_days}
          />
        </Field>
        <Field
          id="retention_months"
          label="Retention (months)"
          hint="Closed cases are deleted after this long. Default 36."
          error={errors.retention_months}
        >
          <Input
            id="retention_months"
            name="retention_months"
            type="number"
            min={6}
            max={120}
            defaultValue={values.retention_months}
            className="w-24 tabular-nums"
            aria-invalid={!!errors.retention_months}
          />
        </Field>
      </div>

      <Field
        id="contact_email"
        label="Contact email for requesters"
        hint="Named on the public form's confirmation page and email as who to ask. Leave empty to name the organisation only."
        error={errors.contact_email}
      >
        <Input id="contact_email" name="contact_email" type="email" defaultValue={values.contact_email} maxLength={254} aria-invalid={!!errors.contact_email} />
      </Field>

      <div className="flex items-start gap-3">
        <input
          id="form_enabled"
          name="form_enabled"
          type="checkbox"
          defaultChecked={values.form_enabled}
          className="mt-1 size-4 rounded border-input accent-primary"
        />
        <Label htmlFor="form_enabled" className="flex flex-col gap-1 font-normal">
          <span className="font-medium">Take requests through the public form</span>
          <span className="text-sm text-muted-foreground">When off, the form&apos;s address shows a notice instead.</span>
        </Label>
      </div>

      <div className="flex items-start gap-3">
        <input
          id="ai_enabled"
          name="ai_enabled"
          type="checkbox"
          defaultChecked={values.ai_enabled}
          className="mt-1 size-4 rounded border-input accent-primary"
        />
        <Label htmlFor="ai_enabled" className="flex flex-col gap-1 font-normal">
          <span className="font-medium">Use AI triage and letter drafts for this client</span>
          <span className="text-sm text-muted-foreground">A person still confirms every result and sends every letter.</span>
        </Label>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
