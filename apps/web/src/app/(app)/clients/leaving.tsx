"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteClient, type DeleteClientState } from "./actions";

/**
 * Delete one client and everything held for it. It cannot be undone, so it takes three things:
 * opening the form, typing the client's name exactly, and saying who asked and why. The
 * database checks all of it again, and writes what was deleted to the team log.
 */
export function DeleteClient({ orgId, name, counts }: { orgId: string; name: string; counts: { cases: number; open: number; inbox: number } }) {
  const [state, formAction, pending] = useActionState<DeleteClientState, FormData>(deleteClient.bind(null, orgId), { error: null });
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const ready = typed.trim() === name && reason.trim().length >= 5;

  if (!open) {
    return (
      <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)}>
        <Trash2 data-icon="inline-start" aria-hidden="true" />
        Delete this client…
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-danger/50 bg-danger-bg/40 p-4">
      <div>
        <h3 className="font-semibold">Delete {name} and everything held for it</h3>
        <p className="mt-1 text-sm">
          This deletes {counts.cases === 1 ? "its 1 case" : `its ${counts.cases} cases`}
          {counts.open > 0 ? ` (${counts.open} still open)` : ""}, their audit trails, {counts.inbox === 1 ? "1 inbox message" : `${counts.inbox} inbox messages`}, its public form and its settings.{" "}
          <span className="font-medium">It cannot be undone, and nothing can be recovered afterwards.</span> Download everything above first if the client wants its data back.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">The team log keeps a record that this was done, by whom, how much was deleted, and the reason you give.</p>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>Not deleted</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm_name">
          Type the client&apos;s name to confirm: <span className="font-mono font-normal">{name}</span>
        </Label>
        <Input id="confirm_name" name="confirm_name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} required className="max-w-sm bg-card" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Who asked for this, and why</Label>
        <Textarea id="reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} required className="bg-card" placeholder="For example: the client ended the contract and asked for deletion, email of 20 November" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="destructive" size="lg" disabled={!ready || pending}>
          {pending ? "Deleting…" : "Delete it all, for good"}
        </Button>
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => setOpen(false)}>
          Keep the client
        </Button>
      </div>
    </form>
  );
}
