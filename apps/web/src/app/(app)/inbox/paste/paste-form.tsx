"use client";

import { useActionState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { pasteItem, type InboxActionState } from "../actions";

const selectClass = cn(
  "h-8 w-full max-w-sm rounded-lg border border-input bg-background px-2.5 text-sm",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
);

export function PasteForm({ clients }: { clients: { id: string; name: string; code: string }[] }) {
  const [state, formAction, pending] = useActionState<InboxActionState, FormData>(pasteItem, { error: null });
  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>Not added</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="organisation_id">Sent to</Label>
        <select id="organisation_id" name="organisation_id" className={selectClass} required defaultValue={clients[0]?.id}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="from_name">From (name)</Label>
          <Input id="from_name" name="from_name" maxLength={200} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="from_email">From (email)</Label>
          <Input id="from_email" name="from_email" type="email" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" maxLength={300} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="body">The message</Label>
        <Textarea id="body" name="body" rows={10} required minLength={10} autoFocus />
        <p className="text-sm text-muted-foreground">Paste the email or letter as received. Leave out bank or health details that are not needed.</p>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Triaging…" : "Add to inbox and triage"}
        </Button>
      </div>
    </form>
  );
}
