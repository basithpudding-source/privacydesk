"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REGIONS } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { createDesk, type SetupState } from "./actions";

const KINDS = [
  { value: "organisation", label: "Our own organisation", detail: "A team handling the requests and complaints our organisation receives." },
  { value: "consultancy", label: "A consultancy", detail: "We handle requests and complaints for client organisations." },
] as const;

const selectClass = cn(
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
);

/** The first screen after signing in for the first time: who the desk is for, and its name. */
export function SetupForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(createDesk, { values: { kind: "", name: "", code: "", region: "england-and-wales" }, errors: {} });
  const [kind, setKind] = useState(state.values.kind);
  const { values, errors } = state;
  const own = kind === "organisation";

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      {errors.form && (
        <Alert variant="destructive">
          <AlertTitle>The desk was not set up</AlertTitle>
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}

      <fieldset className="flex flex-col gap-2.5" aria-describedby={errors.kind ? "kind-error" : undefined}>
        <legend className="mb-1.5 text-sm font-medium">Who is this desk for?</legend>
        {KINDS.map((k) => (
          <label key={k.value} className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm", kind === k.value ? "border-primary bg-primary/5" : "border-border")}>
            <input type="radio" name="kind" value={k.value} required checked={kind === k.value} onChange={() => setKind(k.value)} className="mt-0.5 size-4 accent-primary" />
            <span>
              <span className="font-medium">{k.label}</span>
              <span className="block text-muted-foreground">{k.detail}</span>
            </span>
          </label>
        ))}
        {errors.kind && (
          <p id="kind-error" className="text-sm text-destructive" role="alert">
            {errors.kind}
          </p>
        )}
      </fieldset>

      {kind && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{own ? "Organisation name" : "Consultancy name"}</Label>
            <Input id="name" name="name" required minLength={2} maxLength={120} defaultValue={values.name} placeholder={own ? "Example Housing Trust" : "Example Data Protection Ltd"} aria-invalid={Boolean(errors.name)} />
            {errors.name ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.name}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{own ? "As people who write to you would recognise it. It appears on your public request form and in letters." : "The name your clients would recognise."}</p>
            )}
          </div>

          {own && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">Short code</Label>
                <Input id="code" name="code" required maxLength={6} defaultValue={values.code} placeholder="ACME" autoCapitalize="characters" spellCheck={false} className="w-32 font-mono uppercase" aria-invalid={Boolean(errors.code)} />
                {errors.code ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.code}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">2 to 6 letters or digits. It starts every case reference, as in ACME-001, so it cannot change once cases exist.</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="region">Region</Label>
                <select id="region" name="region" defaultValue={values.region} className={selectClass}>
                  {REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {errors.region ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.region}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Decides which bank holidays move a deadline. You can change it later.</p>
                )}
              </div>
            </>
          )}

          <div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Setting up…" : "Set up the desk"}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
