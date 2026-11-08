"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Step =
  | { kind: "idle" }
  | { kind: "showing"; factorId: string; qr: string; secret: string }
  | { kind: "done" };

/** Enrols a time-based one-time code app (TOTP) as the second factor. */
export function EnrolTotp({ nextHref }: { nextHref: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? "Enrolment could not start.");
      return;
    }
    setStep({ kind: "showing", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "showing") return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: step.factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setError("That code did not match. Codes change every 30 seconds; enter the current one.");
      return;
    }
    setStep({ kind: "done" });
    router.push(nextHref);
    router.refresh();
  }

  if (step.kind === "done") {
    return <p className="text-sm text-muted-foreground">Second factor added. Taking you back…</p>;
  }

  if (step.kind === "idle") {
    return (
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not start</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          You need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
        <div>
          <Button onClick={start} disabled={busy}>
            {busy ? "Starting…" : "Set up authenticator app"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="flex max-w-md flex-col gap-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Open your authenticator app and choose to add an account.</li>
        <li>
          Scan this code, or type the key below it.
          {/* The QR code comes from Supabase as a data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.qr} alt="QR code for your authenticator app" width={176} height={176} className="mt-2 rounded-lg bg-white p-2" />
          <code className="mt-2 block break-all rounded bg-muted px-2 py-1 font-mono text-xs">{step.secret}</code>
        </li>
        <li>Enter the six-digit code the app shows.</li>
      </ol>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Not confirmed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Six-digit code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-32 font-mono text-lg tracking-widest"
          autoFocus
        />
      </div>
      <div>
        <Button type="submit" disabled={busy || code.trim().length !== 6}>
          {busy ? "Checking…" : "Confirm and turn on"}
        </Button>
      </div>
    </form>
  );
}
