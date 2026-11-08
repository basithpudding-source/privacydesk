"use client";

import { useActionState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CASE_TYPES } from "@/lib/cases/labels";
import { cn } from "@/lib/utils";
import { acceptItem, declineItem, retriageItem, type InboxActionState } from "./actions";

const selectClass = cn(
  "h-8 w-full max-w-xs rounded-lg border border-input bg-background px-2.5 text-sm",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
);

export interface Proposed {
  type: string;
  receivedOn: string;
  requesterName: string;
  requesterEmail: string;
  summary: string;
  idRequired: boolean;
}

export function AcceptForm({ itemId, proposed, today }: { itemId: string; proposed: Proposed; today: string }) {
  const [state, formAction, pending] = useActionState<InboxActionState, FormData>(acceptItem.bind(null, itemId), { error: null });
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>Not accepted</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">Type of request</Label>
          <select id="type" name="type" defaultValue={CASE_TYPES.some((t) => t.value === proposed.type) ? proposed.type : "sar"} className={selectClass}>
            {CASE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="received_on">Date received</Label>
          <Input id="received_on" name="received_on" type="date" defaultValue={proposed.receivedOn} max={today} required className="w-44 tabular-nums" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="requester_name">Person&apos;s name</Label>
          <Input id="requester_name" name="requester_name" defaultValue={proposed.requesterName} maxLength={200} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="requester_email">Person&apos;s email</Label>
          <Input id="requester_email" name="requester_email" type="email" defaultValue={proposed.requesterEmail} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="summary">Summary</Label>
        <Input id="summary" name="summary" defaultValue={proposed.summary} maxLength={300} />
      </div>
      <div className="flex items-start gap-3">
        <input id="id_required" name="id_required" type="checkbox" defaultChecked={proposed.idRequired} className="mt-1 size-4 rounded border-input accent-primary" />
        <Label htmlFor="id_required" className="font-normal">
          Proof of identity needed before the clock starts
        </Label>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Accept: create the case"}
        </Button>
      </div>
    </form>
  );
}

export function DeclineForm({ itemId }: { itemId: string }) {
  const [state, formAction, pending] = useActionState<InboxActionState, FormData>(declineItem.bind(null, itemId), { error: null });
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">Why it is being declined</Label>
        <Textarea id="reason" name="reason" rows={2} required maxLength={500} placeholder="Not about personal data; spam; duplicate of EHT-001…" />
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Declining…" : "Decline"}
        </Button>
      </div>
    </form>
  );
}

export function RetriageButton({ itemId }: { itemId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(() => retriageItem(itemId).then(() => undefined))}>
      {pending ? "Running…" : "Run triage again"}
    </Button>
  );
}
