"use client";

import { useActionState } from "react";
import { Undo2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface State {
  error: string | null;
}

/**
 * Undoing a decision always asks why, because the reason goes on the record beside the
 * decision it undoes. Nothing is deleted by an undo.
 */
export function UndoForm({
  action,
  title,
  explain,
  button,
  placeholder,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  title: string;
  explain: string;
  button: string;
  placeholder?: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, { error: null });
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <Undo2 className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{explain}</p>
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>Not done</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="undo-reason">Why (kept on the record)</Label>
        <Textarea id="undo-reason" name="reason" required rows={2} maxLength={500} placeholder={placeholder} className="bg-card" />
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Working…" : button}
        </Button>
      </div>
    </form>
  );
}
