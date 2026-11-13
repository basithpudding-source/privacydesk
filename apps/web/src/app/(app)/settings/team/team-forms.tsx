"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MemberRole } from "@/lib/db/types";
import type { DeskKind } from "@/lib/desk";
import { ROLE_LABELS, ROLES, roleAllows } from "@/lib/team";
import { cn } from "@/lib/utils";
import { addPerson, changeAccess, removePerson, withdrawInvitation, type TeamResult } from "./actions";

const selectClass = cn(
  "h-8 rounded-lg border border-input bg-background px-2.5 text-sm",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
);

/** Add a colleague: the address they sign in with, and what they may do. */
export function AddPersonForm({ kind, signInUrl }: { kind: DeskKind; signInUrl: string }) {
  const [state, formAction, pending] = useActionState<TeamResult, FormData>(addPerson, { error: null });
  const [role, setRole] = useState<MemberRole>("client_user");

  return (
    // Keyed by the address just added, so the box empties ready for the next person.
    <form action={formAction} key={state.added ?? "new"} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>Not added</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.added && !state.error && (
        <Alert role="status">
          <AlertTitle>{state.added} can now join</AlertTitle>
          <AlertDescription>
            No email has been sent. Tell them to sign in at <span className="break-all font-mono text-xs">{signInUrl}</span> with that address; they will be asked to join, and to set up an authenticator app.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="team-email">Work email address</Label>
        <Input id="team-email" name="email" type="email" required maxLength={254} autoComplete="off" placeholder="name@example.org" className="max-w-sm" />
        <p className="text-sm text-muted-foreground">The address they will sign in with. They join the first time they sign in with it.</p>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1.5 text-sm font-medium">Level of access</legend>
        {ROLES.map((r) => (
          <label key={r} className="flex items-start gap-2.5 text-sm">
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5 size-4 accent-primary" />
            <span>
              <span className="font-medium">{ROLE_LABELS[r]}</span>
              <span className="block text-muted-foreground">{roleAllows(r, kind)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          <UserPlus data-icon="inline-start" aria-hidden="true" />
          {pending ? "Adding…" : "Add to the team"}
        </Button>
      </div>
    </form>
  );
}

/** Run a change, show a refusal beside the row it belongs to, and redraw the page when it works. */
function useTeamChange() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(work: () => Promise<TeamResult>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }
  return { pending, error, run };
}

/** One member's access and the button to remove them. Shown only to an administrator. */
export function MemberControls({
  memberId,
  who,
  role,
  canChangeRole,
  canRemove,
  why,
}: {
  memberId: string;
  /** The person's address, for the labels and the question before removing. */
  who: string;
  role: MemberRole;
  canChangeRole: boolean;
  canRemove: boolean;
  /** Why something is not offered, in a sentence. */
  why: string | null;
}) {
  const { pending, error, run } = useTeamChange();
  const [asking, setAsking] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="sr-only" htmlFor={`access-${memberId}`}>
          Level of access for {who}
        </label>
        <select
          id={`access-${memberId}`}
          className={selectClass}
          value={role}
          disabled={pending || !canChangeRole}
          title={!canChangeRole ? (why ?? undefined) : undefined}
          onChange={(e) => {
            const next = e.target.value;
            run(() => changeAccess(memberId, next));
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {asking ? (
          <>
            <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => run(() => removePerson(memberId))}>
              {pending ? "Removing…" : "Remove now"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setAsking(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={pending || !canRemove} title={!canRemove ? (why ?? undefined) : undefined} onClick={() => setAsking(true)}>
            Remove
          </Button>
        )}
      </div>
      {asking && !error && <p className="max-w-xs text-right text-xs text-muted-foreground">Remove {who}? They lose access straight away. What they did stays on the audit trails.</p>}
      {error && (
        <p className="max-w-xs text-right text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Take back an invitation before the person has signed in. */
export function WithdrawButton({ invitationId, who }: { invitationId: string; who: string }) {
  const { pending, error, run } = useTeamChange();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => withdrawInvitation(invitationId))} aria-label={`Withdraw the invitation for ${who}`}>
        {pending ? "Withdrawing…" : "Withdraw"}
      </Button>
      {error && (
        <p className="max-w-xs text-right text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
